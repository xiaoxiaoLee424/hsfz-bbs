import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzip, gunzip, gunzipSync } from "node:zlib";
import { db, ATTACHMENT_DIR } from "./db";
import { DOCUMENT_LIMITS } from "./attachment-limits";

export { ATTACHMENT_DIR };
export class AttachmentError extends Error {}
const compress = promisify(gzip);
const decompress = promisify(gunzip);
export type AttachmentKind = "pdf" | "file";
export type AttachmentSummary = {
  id: string; name: string; kind: AttachmentKind; size: number; storedSize: number; replyId: number;
};
export type PreparedAttachment = {
  name: string; kind: AttachmentKind; size: number; storedSize: number;
  hash: string; encoding: "raw" | "gzip"; bytes: Buffer;
};
export type AttachmentStorage = {
  path: string; encoding: "raw" | "gzip"; size: number; storedSize: number; hash: string;
};

const DANGEROUS_EXTENSIONS = new Set([
  "exe", "dll", "bat", "cmd", "com", "scr", "msi", "msp", "msix", "appx", "appxbundle", "msixbundle",
  "ps1", "psm1", "psd1", "sh", "bash", "zsh", "fish", "js", "mjs", "cjs", "jse", "vbs", "vbe", "wsf", "wsh",
  "hta", "lnk", "url", "scf", "reg", "inf", "cpl", "pif", "jar", "class", "apk", "app", "dmg", "pkg", "deb", "rpm",
  "docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppam", "ppsm", "sldm",
]);
const COMPRESSIBLE_EXTENSIONS = new Set(["txt", "md", "markdown", "html", "htm", "csv", "tsv", "json", "xml", "log", "rtf", "tex", "yaml", "yml"]);
const SHA256 = /^[a-f0-9]{64}$/;
let transactionFiles: Set<string> | undefined;

function contentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function objectPath(hash: string): string {
  if (!SHA256.test(hash)) throw new AttachmentError("附件标识无效");
  return path.join(ATTACHMENT_DIR, hash);
}
function displayName(value: string): string {
  return Array.from(value.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/:/g, "_").trim().replace(/[. ]+$/, "")).slice(-180).join("");
}

/** Run the outer SQL transaction here so filesystem cleanup follows commit/rollback. */
export function attachmentTransaction<T>(callback: () => T): T {
  if (db.inTransaction) return callback();
  cleanupUnreferencedAttachments();
  const created = new Set<string>();
  let result: T;
  try {
    result = db.transaction(() => {
      transactionFiles = created;
      try { return callback(); } finally { transactionFiles = undefined; }
    }).immediate();
  } catch (error) {
    safelyCleanup(created);
    throw error;
  }
  safelyCleanup(created);
  return result;
}
function safelyCleanup(created: Set<string>): void {
  try { cleanupUnreferencedAttachments(false, created); }
  catch (error) { console.error("附件清理未完成，将在后续操作或重启时重试", error); }
}

/** Hold the writer lock so another worker cannot reference a file while it is removed. */
export function cleanupUnreferencedAttachments(scanOrphans = false, candidates: Iterable<string> = []): void {
  if (db.inTransaction) return;
  db.transaction(() => {
    const unused = db.prepare(`SELECT hash FROM attachment_objects o
      WHERE NOT EXISTS (SELECT 1 FROM attachment_files a WHERE a.object_hash = o.hash)`).all() as { hash: string }[];
    const hashes = new Set([...candidates, ...unused.map(row => row.hash)]);
    if (scanOrphans) {
      for (const file of readdirSync(ATTACHMENT_DIR)) if (SHA256.test(file)) hashes.add(file);
    }
    for (const hash of hashes) {
      if (!SHA256.test(hash) || db.prepare("SELECT 1 FROM attachment_files WHERE object_hash = ?").get(hash)) continue;
      try { unlinkSync(objectPath(hash)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // Keep this object's metadata for retry; do not roll back earlier successful removals.
          console.error("附件对象暂时无法删除，将在后续清理时重试", error);
          continue;
        }
      }
      db.prepare("DELETE FROM attachment_objects WHERE hash = ?").run(hash);
    }
  }).immediate();
}

function storeObject(file: PreparedAttachment): void {
  const previous = db.prepare("SELECT raw_size, stored_size FROM attachment_objects WHERE hash = ?").get(file.hash) as { raw_size: number; stored_size: number } | undefined;
  if (previous) {
    if (previous.raw_size !== file.size || !existsSync(objectPath(file.hash)) || statSync(objectPath(file.hash)).size !== previous.stored_size) {
      throw new AttachmentError("已有附件数据异常，请联系管理员");
    }
    return;
  }
  const destination = objectPath(file.hash);
  // Interrupted writers can leave files without metadata; all current writers hold this lock.
  if (existsSync(destination)) unlinkSync(destination);
  transactionFiles?.add(file.hash);
  const descriptor = openSync(destination, "wx", 0o600);
  try { writeFileSync(descriptor, file.bytes); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  db.prepare("INSERT INTO attachment_objects (hash, encoding, raw_size, stored_size) VALUES (?, ?, ?, ?)")
    .run(file.hash, file.encoding, file.size, file.storedSize);
}

export async function prepareAttachments(files: File[]): Promise<PreparedAttachment[]> {
  if (files.length > DOCUMENT_LIMITS.maxFiles) throw new AttachmentError("每次最多上传 3 个附件");
  if (files.reduce((sum, file) => sum + file.size, 0) > DOCUMENT_LIMITS.maxTotalBytes) throw new AttachmentError("附件总大小不能超过 8MB");
  const prepared: PreparedAttachment[] = [];
  for (const file of files) {
    const name = displayName(file.name);
    const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
    if (!name || name.split(".").some(part => DANGEROUS_EXTENSIONS.has(part.toLowerCase()))) {
      throw new AttachmentError("不能上传可执行程序、脚本、快捷方式或含宏的文件");
    }
    if (!file.size || file.size > DOCUMENT_LIMITS.maxFileBytes) throw new AttachmentError("附件不能为空，且不能超过 5MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== file.size) throw new AttachmentError("附件读取失败，请重新选择文件");
    const kind: AttachmentKind = extension === "pdf" ? "pdf" : "file";
    if (kind === "pdf" && (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(bytes.subarray(0, 16).toString("latin1")) ||
        !/%%EOF[\t\n\r ]*$/.test(bytes.subarray(-1024).toString("latin1")))) throw new AttachmentError("PDF 文件无效或已损坏");
    // Office, archives, images and PDFs are already compressed; avoid recompressing them.
    const zipped = COMPRESSIBLE_EXTENSIONS.has(extension) ? await compress(bytes) : undefined;
    const useGzip = !!zipped && zipped.length <= bytes.length * 0.95;
    const stored = useGzip ? zipped! : bytes;
    prepared.push({ name, kind, size: bytes.length, storedSize: stored.length, hash: contentHash(bytes),
      encoding: useGzip ? "gzip" : "raw", bytes: stored });
  }
  return prepared;
}

export function persistAttachments(documents: PreparedAttachment[], userId: number, threadId: number, replyId = 0): void {
  if (!documents.length) return;
  attachmentTransaction(() => {
    const owner = replyId ? db.prepare("SELECT author_id FROM replies WHERE id = ? AND thread_id = ?").get(replyId, threadId) :
      db.prepare("SELECT author_id FROM threads WHERE id = ?").get(threadId);
    if ((owner as { author_id: number } | undefined)?.author_id !== userId) throw new AttachmentError("附件所属帖子不存在");
    const current = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(o.raw_size), 0) AS bytes FROM attachment_files a
      JOIN attachment_objects o ON o.hash = a.object_hash WHERE a.thread_id = ? AND a.reply_id = ?`).get(threadId, replyId) as { count: number; bytes: number };
    if (current.count + documents.length > DOCUMENT_LIMITS.maxFiles) throw new AttachmentError("每篇帖子或回复最多保留 3 个附件");
    const total = documents.reduce((sum, file) => sum + file.size, 0);
    if (current.bytes + total > DOCUMENT_LIMITS.maxTotalBytes) throw new AttachmentError("附件总大小不能超过 8MB");
    const userUsed = (db.prepare(`SELECT COALESCE(SUM(o.raw_size), 0) AS n FROM attachment_files a
      JOIN attachment_objects o ON o.hash = a.object_hash WHERE a.user_id = ?`).get(userId) as { n: number }).n;
    if (userUsed + total > DOCUMENT_LIMITS.userBytes) throw new AttachmentError("你的附件总量已达到 32MB，请联系管理员清理旧附件");
    let globalUsed = (db.prepare("SELECT COALESCE(SUM(stored_size), 0) AS n FROM attachment_objects").get() as { n: number }).n;
    const insert = db.prepare("INSERT INTO attachment_files (id, object_hash, user_id, thread_id, reply_id, name, kind) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const file of documents) {
      if (!db.prepare("SELECT 1 FROM attachment_objects WHERE hash = ?").get(file.hash)) {
        globalUsed += file.storedSize;
        if (globalUsed > DOCUMENT_LIMITS.globalStoredBytes) throw new AttachmentError("附件存储空间已满，请稍后再试或联系管理员");
      }
      storeObject(file);
      insert.run(randomBytes(16).toString("hex"), file.hash, userId, threadId, replyId, file.name, file.kind);
    }
  });
}

const summaryColumns = "a.id, a.name, a.kind, o.raw_size AS size, o.stored_size AS storedSize, a.reply_id AS replyId";
const visibleJoin = `FROM attachment_files a JOIN attachment_objects o ON o.hash = a.object_hash
  JOIN threads t ON t.id = a.thread_id JOIN boards board ON board.id = t.board_id
  WHERE (a.reply_id = 0 OR EXISTS (SELECT 1 FROM replies r WHERE r.id = a.reply_id AND r.thread_id = t.id))`;
export function attachmentsForThread(threadId: number): AttachmentSummary[] {
  return db.prepare(`SELECT ${summaryColumns} ${visibleJoin} AND a.thread_id = ? ORDER BY a.rowid`).all(threadId) as AttachmentSummary[];
}
export function getAttachment(id: string): (AttachmentSummary & { threadId: number; boardSlug: string }) | undefined {
  if (!/^[a-f0-9]{32}$/.test(id)) return undefined;
  return db.prepare(`SELECT ${summaryColumns}, a.thread_id AS threadId, board.slug AS boardSlug ${visibleJoin} AND a.id = ?`).get(id) as
    (AttachmentSummary & { threadId: number; boardSlug: string }) | undefined;
}
export function getAttachmentStorage(id: string): AttachmentStorage | undefined {
  if (!getAttachment(id)) return undefined;
  const row = db.prepare(`SELECT o.encoding, o.raw_size AS size, o.stored_size AS storedSize, o.hash
    FROM attachment_files a JOIN attachment_objects o ON o.hash = a.object_hash WHERE a.id = ?`).get(id) as Omit<AttachmentStorage, "path">;
  if (!row || row.size < 1 || row.size > DOCUMENT_LIMITS.maxFileBytes || row.storedSize < 1 ||
      row.storedSize > DOCUMENT_LIMITS.maxFileBytes || !["raw", "gzip"].includes(row.encoding)) throw new AttachmentError("附件数据无效");
  const destination = objectPath(row.hash);
  try {
    if (statSync(destination).size !== row.storedSize) throw new Error("size mismatch");
  } catch { throw new AttachmentError("附件数据损坏，无法读取"); }
  return { ...row, path: destination };
}
export async function readAttachmentContent(id: string): Promise<Buffer> {
  const row = getAttachmentStorage(id);
  if (!row) throw new AttachmentError("附件不存在");
  let content: Buffer;
  try {
    const bytes = await readFile(row.path);
    content = row.encoding === "gzip" ? await decompress(bytes, { maxOutputLength: row.size }) : bytes;
  } catch { throw new AttachmentError("附件数据损坏，无法读取"); }
  if (content.length !== row.size || contentHash(content) !== row.hash) throw new AttachmentError("附件数据损坏，无法读取");
  return content;
}
export function deleteThreadAttachments(threadId: number): void {
  attachmentTransaction(() => { db.prepare("DELETE FROM attachment_files WHERE thread_id = ?").run(threadId); });
}
/** 删除某条回复的附件；孤立对象由 attachmentTransaction 在提交后统一清理。 */
export function deleteReplyAttachments(replyId: number): void {
  attachmentTransaction(() => { db.prepare("DELETE FROM attachment_files WHERE reply_id = ?").run(replyId); });
}

/** Upgrade the earlier BLOB representation without changing IDs or dropping old files. */
function migrateLegacyAttachments(): void {
  attachmentTransaction(() => {
    const legacy = db.prepare(`SELECT a.*, b.encoding, b.raw_size, b.stored_size, b.bytes
      FROM attachments a JOIN attachment_blobs b ON b.hash = a.blob_hash ORDER BY a.rowid`).all() as Array<{
      id: string; blob_hash: string; user_id: number; thread_id: number; reply_id: number;
      name: string; kind: string; encoding: "raw" | "gzip"; raw_size: number; stored_size: number; bytes: Buffer;
    }>;
    for (const file of legacy) {
      if (file.raw_size < 1 || file.raw_size > DOCUMENT_LIMITS.maxFileBytes || file.bytes.length !== file.stored_size) throw new AttachmentError("旧附件数据异常，迁移未完成");
      const raw = file.encoding === "gzip" ? gunzipSync(file.bytes, { maxOutputLength: file.raw_size }) : file.bytes;
      if (raw.length !== file.raw_size || createHash("sha256").update(file.kind).update("\0").update(raw).digest("hex") !== file.blob_hash) {
        throw new AttachmentError("旧附件数据损坏，迁移未完成");
      }
      const hash = contentHash(raw);
      storeObject({ name: file.name, kind: file.kind === "pdf" ? "pdf" : "file", size: raw.length,
        storedSize: file.bytes.length, encoding: file.encoding, hash, bytes: file.bytes });
      db.prepare("INSERT INTO attachment_files (id, object_hash, user_id, thread_id, reply_id, name, kind) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(file.id, hash, file.user_id, file.thread_id, file.reply_id, file.name, file.kind === "pdf" ? "pdf" : "file");
    }
    db.prepare("DELETE FROM attachments").run();
  });
}

migrateLegacyAttachments();
cleanupUnreferencedAttachments(true);
