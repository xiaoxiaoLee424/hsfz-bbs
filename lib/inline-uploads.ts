import { db, ATTACHMENT_DIR } from "./db";
import path from "node:path";
import { AttachmentError } from "./attachments";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { RootContent } from "mdast";
export const INLINE_DIR = path.join(ATTACHMENT_DIR, "inline");
db.exec(`CREATE TABLE IF NOT EXISTS inline_uploads(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,file TEXT NOT NULL,size INTEGER NOT NULL,thread_id INTEGER NOT NULL DEFAULT 0,reply_id INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS inline_thread_delete AFTER DELETE ON threads BEGIN UPDATE inline_uploads SET thread_id=0,expires=0 WHERE thread_id=OLD.id; END;
CREATE TRIGGER IF NOT EXISTS inline_reply_delete AFTER UPDATE OF deleted ON replies WHEN NEW.deleted=1 BEGIN UPDATE inline_uploads SET thread_id=0,expires=0 WHERE thread_id=NEW.thread_id AND reply_id=NEW.id; END;`);
db.transaction(() => {
  const columns = db.prepare("PRAGMA table_info(inline_uploads)").all() as {
    name: string;
  }[];
  if (!columns.some((c) => c.name === "kind"))
    db.exec(
      "ALTER TABLE inline_uploads ADD COLUMN kind TEXT NOT NULL DEFAULT 'image'",
    );
  if (!columns.some((c) => c.name === "name"))
    db.exec(
      "ALTER TABLE inline_uploads ADD COLUMN name TEXT NOT NULL DEFAULT ''",
    );
}).immediate();
export type InlineRow = {
  kind: string;
  name: string;
  id: string;
  user_id: number;
  file: string;
  size: number;
  thread_id: number;
  reply_id: number;
  expires: number;
};
export function inlineIds(raw: string) {
  const ids = new Set<string>();
  const root = unified().use(remarkParse).parse(raw);
  function walk(n: RootContent | typeof root) {
    if (n.type === "image" || n.type === "link") {
      if (n.url.startsWith("upload-pending:"))
        throw new AttachmentError("请等待上传完成、重试或删除失败的上传占位符");
      const m = /^\/(?:inline-images|inline-files)\/([a-f0-9]{32})$/.exec(
        n.url,
      );
      if (m) ids.add(m[1]);
    }
    if ("children" in n) for (const c of n.children) walk(c as RootContent);
  }
  walk(root);
  return [...ids];
}
export function claimInline(
  raw: string,
  user: number,
  thread: number,
  reply: number,
  remainingBytes: number,
  remainingImages: number,
  remainingFiles = 3,
  remainingFileBytes = 8 * 1024 * 1024,
) {
  const ids = inlineIds(raw);
  let images = 0,
    files = 0,
    fileBytes = 0;
  let total = 0;
  for (const id of ids) {
    const row = db
      .prepare("SELECT * FROM inline_uploads WHERE id=?")
      .get(id) as InlineRow | undefined;
    if (!row) throw new AttachmentError("正文图片不存在");
    // 已挂在正文里的图片可复用；原帖删除时触发器会把它退回过期暂存状态
    if (row.thread_id) {
      const source = db
        .prepare("SELECT 1 FROM threads WHERE id=? AND visibility='public'")
        .get(row.thread_id);
      if (!source) throw new AttachmentError("正文图片已失效");
    } else if (row.user_id !== user || row.expires < Date.now())
      throw new AttachmentError("正文图片已过期或不属于你，请重新上传");
    total += row.size;
    if (row.kind === "image") images++;
    else {
      files++;
      fileBytes += row.size;
    }
  }
  if (
    images > remainingImages ||
    files > remainingFiles ||
    fileBytes > remainingFileBytes
  )
    throw new AttachmentError("图片或附件数量、大小超过限制");
  if (total > remainingBytes)
    throw new AttachmentError("图片和附件合计不能超过10MB");
  for (const id of ids)
    db.prepare(
      "UPDATE inline_uploads SET thread_id=?,reply_id=? WHERE id=? AND thread_id=0",
    ).run(thread, reply, id);
}
