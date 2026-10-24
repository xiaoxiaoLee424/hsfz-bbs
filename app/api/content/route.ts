import { contentExcerpt } from "@/lib/forum-syntax";
import { getCurrentUser } from "@/lib/auth";
import { visibleContent } from "@/lib/content-policy";
import { db } from "@/lib/db";
import { backlinks } from "@/lib/forum-features";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams,
    t = Number(q.get("thread")),
    r = Number(q.get("reply") || 0),
    u = await getCurrentUser();
  if (!Number.isSafeInteger(t) || t <= 0 || !Number.isSafeInteger(r) || r < 0)
    return new Response("Not found", { status: 404 });
  const row = visibleContent(u, t, r);
  if (!row)
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const author =
    !r && row.anonymous
      ? "匿名同学"
      : (
          db
            .prepare("SELECT nickname FROM users WHERE id=?")
            .get(row.author_id) as { nickname: string }
        ).nickname;
  return Response.json(
    {
      title: row.title,
      author,
      avatar:
        !r && row.anonymous
          ? ""
          : (
              db
                .prepare("SELECT avatar FROM users WHERE id=?")
                .get(row.author_id) as { avatar: string }
            ).avatar,
      excerpt: contentExcerpt(row.content),
      backlinks: backlinks(t, r, u),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
