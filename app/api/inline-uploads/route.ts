import { cleanupDraftUploads } from "@/lib/upload-cleanup";
import { boundedForm } from "@/lib/request-body";
import { sameOrigin } from "@/lib/request-origin";
import { getCurrentUser } from "@/lib/auth";
import { db, UPLOAD_DIR } from "@/lib/db";
import { INLINE_DIR } from "@/lib/inline-uploads";
import { prepareAttachments } from "@/lib/attachments";
import { gunzipSync } from "node:zlib";
import { saveUploadImage } from "@/lib/upload";
import { allowAction } from "@/lib/ratelimit";
import { mkdir, rename, unlink, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return new Response("请登录", { status: 401 });
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  if (!allowAction(`inline:${u.id}`, 60000, 20).ok)
    return new Response("上传过快", { status: 429 });
  if (Number(req.headers.get("content-length")) > 9 * 1024 * 1024)
    return new Response("文件过大", { status: 413 });
  await mkdir(INLINE_DIR, { recursive: true, mode: 0o700 });
  cleanupDraftUploads();
  let form: FormData;
  try {
    form = await boundedForm(req, 9 * 1024 * 1024);
  } catch {
    return new Response("上传内容无效或过大", { status: 400 });
  }
  const f = form.get("file");
  if (!(f instanceof File)) return new Response("请选择图片", { status: 400 });
  let file = "";
  try {
    const id = randomBytes(16).toString("hex");
    let kind = "image",
      name = f.name;
    if (
      ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(f.type)
    ) {
      const url = await saveUploadImage(f, "inline");
      file = path.basename(url);
      await rename(path.join(UPLOAD_DIR, file), path.join(INLINE_DIR, file));
    } else {
      const [prepared] = await prepareAttachments([f]);
      kind = prepared.kind;
      name = prepared.name;
      file = id + ".bin";
      await writeFile(
        path.join(INLINE_DIR, file),
        prepared.encoding === "gzip"
          ? gunzipSync(prepared.bytes)
          : prepared.bytes,
        { flag: "wx", mode: 0o600 },
      );
    }
    const bytes = (await stat(path.join(INLINE_DIR, file))).size;
    db.transaction(() => {
      const used = (
        db
          .prepare(
            "SELECT COALESCE(SUM(size),0) AS n FROM inline_uploads WHERE user_id=?",
          )
          .get(u.id) as { n: number }
      ).n;
      const globalUsed = (
        db
          .prepare("SELECT COALESCE(SUM(size),0) AS n FROM inline_uploads")
          .get() as { n: number }
      ).n;
      if (globalUsed + bytes > 512 * 1024 * 1024)
        throw new Error("正文图片存储空间已满");
      if (used + bytes > 32 * 1024 * 1024)
        throw new Error("正文图片总量超过32MB");
      db.prepare(
        "INSERT INTO inline_uploads(id,user_id,file,size,expires,kind,name) VALUES(?,?,?,?,?,?,?)",
      ).run(id, u.id, file, bytes, Date.now() + 86400000, kind, name);
    }).immediate();
    return Response.json({
      url: (kind === "image" ? "/inline-images/" : "/inline-files/") + id,
      kind,
      name,
    });
  } catch (e) {
    if (file) await unlink(path.join(INLINE_DIR, file));
    return new Response(e instanceof Error ? e.message : "上传失败", {
      status: 400,
    });
  }
}
