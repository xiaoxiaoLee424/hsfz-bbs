import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { db } from "./db";
import { ATTACHMENT_TTL_MS, MAX_FILE_BYTES, MAX_COMPRESSED_BYTES, type AttachmentInfo } from "./file-transfer";

export class AttachmentError extends Error {}
export type PreparedAttachment = { filename: string; originalSize: number; payload: Buffer };

export async function prepareAttachment(form: FormData): Promise<PreparedAttachment | undefined> {
  const file = form.get("attachment");
  if (file === null) return undefined;
  if (!(file instanceof File) || !file.size || file.size > MAX_COMPRESSED_BYTES) throw new AttachmentError("压缩文件无效或超过大小限制");
  const size = Number(form.get("attachment_size"));
  if (!form.has("attachment_size") || !Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new AttachmentError("原始文件不能超过 10 MB");
  const name = String(form.get("attachment_name") ?? "").split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!name || name.length > 255) throw new AttachmentError("文件名需为 1–255 字");
  const payload = Buffer.from(await file.arrayBuffer());
  // Never trust browser metadata: bound expansion and verify gzip CRC/actual length.
  // Only compressed bytes are persisted; this validation buffer is transient.
  try {
    const original = gunzipSync(payload, { maxOutputLength: MAX_FILE_BYTES + 1 });
    if (original.length !== size || original.length > MAX_FILE_BYTES) throw new Error("size mismatch");
  } catch { throw new AttachmentError("文件校验失败：请重新压缩上传，原始文件需不超过 10 MB"); }
  purgeExpiredAttachments();
  return { filename: name, originalSize: size, payload };
}

// Called inside the message transaction: no orphan uploads if a message fails.
export function insertAttachment(file: PreparedAttachment): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO chat_attachments(id, filename, original_size, compressed_size, expires_at, payload)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, file.filename, file.originalSize, file.payload.length, Date.now() + ATTACHMENT_TTL_MS, file.payload);
  return id;
}

export function purgeExpiredAttachments(now = Date.now()): number {
  const removed = db.prepare("DELETE FROM chat_attachments WHERE expires_at <= ?").run(now).changes;
  // secure_delete clears freed database pages; truncate stale BLOBs from the WAL too.
  if (removed) db.pragma("wal_checkpoint(TRUNCATE)");
  return removed;
}

export function attachmentInfo(id: string): AttachmentInfo | undefined {
  return db.prepare(`SELECT id, filename, original_size, compressed_size, expires_at FROM chat_attachments
    WHERE id = ? AND expires_at > ?`).get(id, Date.now()) as AttachmentInfo | undefined;
}

export function readAttachment(userId: number, id: string):
  | { status: "missing" }
  | { status: "expired" }
  | { status: "ready"; file: AttachmentInfo & { payload: Buffer } } {
  purgeExpiredAttachments();
  if (!db.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'approved' AND banned = 0").get(userId)) return { status: "missing" };
  // Authorize through the surviving message, even after its BLOB has expired.
  const allowed = db.prepare(`SELECT 1 FROM direct_messages m JOIN direct_conversations c ON c.id = m.conversation_id
    WHERE m.attachment_id = ? AND (c.user_low = ? OR c.user_high = ?)
    UNION ALL SELECT 1 FROM group_messages m JOIN group_members gm ON gm.group_id = m.group_id
    WHERE m.attachment_id = ? AND gm.user_id = ? LIMIT 1`).get(id, userId, userId, id, userId);
  if (!allowed) return { status: "missing" };
  const file = db.prepare("SELECT * FROM chat_attachments WHERE id = ? AND expires_at > ?").get(id, Date.now()) as (AttachmentInfo & { payload: Buffer }) | undefined;
  return file ? { status: "ready", file } : { status: "expired" };
}

// A running SQLite host purges without waiting for another upload/download.
// Startup/read/upload cleanup also covers process restarts or suspended runtimes.
const lifecycle = globalThis as unknown as { __bbsAttachmentCleanup?: ReturnType<typeof setInterval> };
purgeExpiredAttachments();
if (!lifecycle.__bbsAttachmentCleanup) {
  lifecycle.__bbsAttachmentCleanup = setInterval(() => {
    if (!db.open) { clearInterval(lifecycle.__bbsAttachmentCleanup); lifecycle.__bbsAttachmentCleanup = undefined; return; }
    // A transient database lock must not crash the web host; retry on the next tick.
    try { purgeExpiredAttachments(); }
    catch (error) { console.error("Expired attachment cleanup failed; will retry", error); }
  }, 1000);
  lifecycle.__bbsAttachmentCleanup.unref();
}
