import { notify } from "@/lib/notify";
import { boundedBody } from "@/lib/request-body";
import { sameOrigin } from "@/lib/request-origin";
import { getCurrentUser } from "@/lib/auth";
import { visibleContent } from "@/lib/content-policy";
import "@/lib/forum-features";
import { db } from "@/lib/db";
import { nativeEmojis } from "@/lib/emoji-catalog";
import { allowAction } from "@/lib/ratelimit";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams,
    t = Number(q.get("thread")),
    r = Number(q.get("reply") || 0),
    u = await getCurrentUser();
  if (
    !Number.isSafeInteger(t) ||
    t <= 0 ||
    !Number.isSafeInteger(r) ||
    r < 0 ||
    !visibleContent(u, t, r)
  )
    return new Response("Not found", { status: 404 });
  if (q.has("users")) {
    const key = q.get("key"),
      cursor = Number(q.get("cursor") || 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0)
      return new Response("参数无效", { status: 400 });
    const rows = db
      .prepare(
        "SELECT DISTINCT u.id,u.username,u.nickname FROM emoji_reactions c JOIN users u ON u.id=c.user_id WHERE c.thread_id=? AND c.reply_id=? AND c.reaction_key=? AND u.id>? ORDER BY u.id LIMIT 21",
      )
      .all(t, r, key, cursor) as {
      id: number;
      username: string;
      nickname: string;
    }[];
    return Response.json(
      {
        items: rows.slice(0, 20),
        nextCursor: rows.length > 20 ? rows[19].id : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return Response.json(snapshot(u, t, r), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** 某条内容的互动快照：表情计数、我的表情、点赞数与是否已赞。GET 与 POST 共用。 */
function snapshot(u: { id: number } | null, t: number, r: number) {
  const counts = db
    .prepare(
      "SELECT reaction_key AS key,COUNT(*) AS count FROM emoji_reactions WHERE thread_id=? AND reply_id=? GROUP BY reaction_key ORDER BY MIN(created_at),reaction_key",
    )
    .all(t, r);
  const mine = u
    ? (
        db
          .prepare(
            "SELECT reaction_key FROM emoji_reactions WHERE thread_id=? AND reply_id=? AND user_id=?",
          )
          .all(t, r, u.id) as { reaction_key: string }[]
      ).map((x) => x.reaction_key)
    : [];
  const likes = r
    ? (
        db.prepare("SELECT COUNT(*) AS n FROM reply_likes WHERE reply_id=?").get(r) as {
          n: number;
        }
      ).n
    : (
        db.prepare("SELECT COUNT(*) AS n FROM thread_likes WHERE thread_id=?").get(t) as {
          n: number;
        }
      ).n;
  const liked =
    !!u &&
    !!(r
      ? db
          .prepare("SELECT 1 FROM reply_likes WHERE reply_id=? AND user_id=?")
          .get(r, u.id)
      : db
          .prepare("SELECT 1 FROM thread_likes WHERE thread_id=? AND user_id=?")
          .get(t, u.id));
  return { counts, mine, likes, liked };
}
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return new Response("请登录", { status: 401 });
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  let body: {
    thread: number;
    reply: number;
    key: string;
    active: boolean;
    like?: boolean;
  };
  try {
    body = JSON.parse((await boundedBody(req, 2048)).toString());
  } catch {
    return new Response("请求无效", { status: 400 });
  }
  if (
    !body ||
    !Number.isSafeInteger(body.thread) ||
    body.thread <= 0 ||
    !Number.isSafeInteger(body.reply) ||
    body.reply < 0 ||
    typeof body.active !== "boolean" ||
    (body.like !== undefined && typeof body.like !== "boolean")
  )
    return new Response("参数无效", { status: 400 });
  const target = visibleContent(u, body.thread, body.reply);
  if (!target) return new Response("Not found", { status: 404 });
  if (!allowAction(`reaction:${u.id}`, 60000, 120).ok)
    return new Response("操作过快", { status: 429 });
  if (
    !body.like &&
    !nativeEmojis.has(body.key) &&
    !(
      typeof body.key === "string" &&
      /^custom:\d+$/.test(body.key) &&
      db
        .prepare("SELECT 1 FROM custom_emojis WHERE id=? AND (active=1 OR ?=0)")
        .get(Number(body.key.slice(7)), Number(body.active))
    )
  )
    return new Response("表情无效", { status: 400 });
  db.transaction(() => {
    if (body.active)
      notify(
        target.author_id,
        "like",
        u.id,
        body.thread,
        body.reply,
        body.like ? "赞了你的内容" : "对你的内容添加了表情反应",
      );
    const { thread: t, reply: r, key, active } = body;
    if (body.like) {
      if (r) {
        if (active)
          db.prepare("INSERT OR IGNORE INTO reply_likes VALUES(?,?)").run(
            r,
            u.id,
          );
        else
          db.prepare(
            "DELETE FROM reply_likes WHERE reply_id=? AND user_id=?",
          ).run(r, u.id);
      } else {
        if (active)
          db.prepare(
            "INSERT OR IGNORE INTO thread_likes(user_id,thread_id) VALUES(?,?)",
          ).run(u.id, t);
        else
          db.prepare(
            "DELETE FROM thread_likes WHERE thread_id=? AND user_id=?",
          ).run(t, u.id);
        db.prepare(
          "UPDATE threads SET like_count=(SELECT COUNT(*) FROM thread_likes WHERE thread_id=?) WHERE id=?",
        ).run(t, t);
      }
    } else if (active)
      db.prepare("INSERT OR IGNORE INTO emoji_reactions VALUES(?,?,?,?,?)").run(
        t,
        r,
        u.id,
        key,
        Date.now(),
      );
    else
      db.prepare(
        "DELETE FROM emoji_reactions WHERE thread_id=? AND reply_id=? AND user_id=? AND reaction_key=?",
      ).run(t, r, u.id, key);
  }).immediate();
  // 直接带回落库后的最新快照，客户端无需再发一次 GET（也缩短按钮的禁用窗口）
  return Response.json(snapshot(u, body.thread, body.reply), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
