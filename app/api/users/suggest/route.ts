import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { allowAction } from "@/lib/ratelimit";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("请登录", { status: 401 });
  if (!allowAction(`suggest:${user.id}`, 60000, 120).ok)
    return new Response("稍后再试", { status: 429 });
  const q = (new URL(request.url).searchParams.get("q") || "")
    .trim()
    .slice(0, 32);
  if (!q) return Response.json([]);
  const prefix = q.replace(/[\\%_]/g, "\\$&") + "%";
  return Response.json(
    db
      .prepare(
        "SELECT username,nickname,avatar FROM users WHERE status='approved' AND banned=0 AND (username LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\') ORDER BY CASE WHEN username LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,username LIMIT 8",
      )
      .all(prefix, prefix, prefix),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
