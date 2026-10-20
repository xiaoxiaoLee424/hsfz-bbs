import { getCurrentUser } from "@/lib/auth";
import { readAttachment } from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "请先登录" }, { status: 401, headers });
  const { id } = await params;
  const result = readAttachment(user.id, id);
  if (result.status === "missing") return Response.json({ message: "文件不存在或你无权下载" }, { status: 404, headers });
  if (result.status === "expired") return Response.json({ message: "文件已过期，上传后仅保留 10 分钟" }, { status: 410, headers });
  // Deliberately no Content-Encoding: fetch must receive the gzip bytes for browser-side decompression.
  return new Response(new Uint8Array(result.file.payload), {
    headers: { ...headers, "Content-Type": "application/gzip", "Content-Length": String(result.file.compressed_size),
      "Content-Disposition": 'attachment; filename="attachment.gz"' },
  });
}
