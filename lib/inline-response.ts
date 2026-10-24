import { getCurrentUser } from "@/lib/auth";
import { visibleContent } from "@/lib/content-policy";
import { db } from "@/lib/db";
import { INLINE_DIR, type InlineRow } from "@/lib/inline-uploads";
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function serveInlineUpload(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id))
    return new Response("Not found", { status: 404 });
  const row = db.prepare("SELECT * FROM inline_uploads WHERE id=?").get(id) as
      InlineRow | undefined,
    u = await getCurrentUser();
  if (
    !row ||
    !(row.thread_id
      ? visibleContent(u, row.thread_id, row.reply_id)
      : u?.id === row.user_id && row.expires > Date.now())
  )
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  const ext = path.extname(row.file).slice(1),
    mime: Record<string, string> = {
      jpg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
  return new Response(
    new Uint8Array(await readFile(path.join(INLINE_DIR, row.file))),
    {
      headers: {
        "Content-Type":
          row.kind === "image" ? mime[ext] : "application/octet-stream",
        ...(row.kind !== "image"
          ? {
              "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(row.name).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
            }
          : {}),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
