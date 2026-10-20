import { recommendationsEnabled } from "@/lib/experiments";
import { ThreadSignals } from "@/components/recommendation/ThreadSignals";
import { MODEL_VERSION } from "@/lib/recommendation/config";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { threadById, threadReplies } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { TitleBadge } from "@/components/TitleBadge";
import { SubmitButton, ConfirmSubmit } from "@/components/SubmitButton";
import { IconHeart, IconStar, IconComment, IconEye } from "@/components/icons";
import { timeAgo, fmtNum } from "@/lib/format";
import {
  toggleLikeAction,
  toggleFavoriteAction,
  deleteOwnThreadAction,
} from "@/app/actions/forum";
import { ReplyForm } from "@/components/ReplyForm";
import { Markdown } from "@/components/Markdown";
import {
  togglePinAction,
  toggleFeatureAction,
  deleteThreadAction,
} from "@/app/actions/admin";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = threadById(Number(id));
  return { title: thread ? thread.title : "帖子" };
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ quote?: string }>;
}) {
  const { id } = await params;
  const { quote: quoteParam } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tid = Number(id);
  if (!Number.isInteger(tid) || tid <= 0) notFound();
  const thread = threadById(tid);
  if (!thread) notFound();

  db.prepare("UPDATE threads SET views = views + 1 WHERE id = ?").run(tid);
  const replies = threadReplies(tid);
  const enabled = recommendationsEnabled(user.id);
  const vectorRow = enabled ? db.prepare("SELECT embedding FROM post_vectors WHERE post_id=? AND model_version=?").get(tid,MODEL_VERSION) as {embedding:Buffer}|undefined : undefined;

  let postImages: string[] = [];
  try {
    postImages = thread.images ? (JSON.parse(thread.images) as string[]) : [];
  } catch {
    postImages = [];
  }
  // 引用回复：楼层映射（回复 id → 楼层号/作者/内容）
  const floorMap = new Map(
    replies.map((r, i) => [r.id, { floor: i + 1, nickname: r.nickname, content: r.content }])
  );
  const quoteId = Number(quoteParam) || 0;
  const quotedReply = quoteId ? replies.find((r) => r.id === quoteId) : undefined;
  const quote = quotedReply
    ? {
        replyTo: quotedReply.id,
        floor: floorMap.get(quotedReply.id)!.floor,
        nickname: quotedReply.nickname,
        content: quotedReply.content,
      }
    : undefined;
  const liked = user
    ? !!db.prepare("SELECT 1 AS x FROM thread_likes WHERE user_id = ? AND thread_id = ?").get(user.id, tid)
    : false;
  const faved = user
    ? !!db.prepare("SELECT 1 AS x FROM thread_favorites WHERE user_id = ? AND thread_id = ?").get(user.id, tid)
    : false;
  const likeCount = (db.prepare("SELECT COUNT(*) AS c FROM thread_likes WHERE thread_id = ?").get(tid) as { c: number }).c;
  const authorPostCount = (db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM threads WHERE author_id = ?) + (SELECT COUNT(*) FROM replies WHERE author_id = ?) AS n`
    )
    .get(thread.author_id, thread.author_id) as { n: number }).n;
  const isAdmin = user?.role === "admin";
  const anonView = thread.anonymous === 1 && !isAdmin;

  return (
    <div className="mx-auto max-w-4xl">
      {enabled && <ThreadSignals userId={user.id} postId={tid} board={thread.board_id} title={thread.title} content={thread.content.slice(0,500)} vector={vectorRow?.embedding.toString("base64")} liked={liked} favorite={faved} replied={replies.some(reply=>reply.username===user.username)} />}
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        <Link href="/" className="hover:text-brand">
          首页
        </Link>
        <span>/</span>
        <Link href={`/b/${thread.slug}`} className="hover:text-brand">
          {thread.board_icon} {thread.board_name}
        </Link>
      </nav>

      {/* 主帖 */}
      <article className="card">
        <div className="border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {thread.is_pinned === 1 && (
              <span className="pill bg-red-500/10 text-red-600 dark:text-red-400">置顶</span>
            )}
            {thread.is_featured === 1 && (
              <span className="pill bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">精华</span>
            )}
            <h1 className="text-xl font-semibold leading-snug">{thread.title}</h1>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <IconEye /> {fmtNum(thread.views)} 浏览
            </span>
            <span className="inline-flex items-center gap-1">
              <IconComment /> {replies.length} 回复
            </span>
            <span>发布于 {timeAgo(thread.created_at)}</span>
          </div>
        </div>

        <div className="flex gap-3 p-4">
          {anonView ? (
            <Avatar user={{ nickname: "匿名同学", username: "anonymous" }} size={40} />
          ) : (
            <Link href={`/u/${thread.author_username}`} className="shrink-0">
              <Avatar
                user={{ nickname: thread.author_name, username: thread.author_username, avatar: thread.author_avatar }}
                size={40}
              />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {anonView ? (
                <span className="text-sm font-semibold">匿名同学</span>
              ) : (
                <>
                  <Link href={`/u/${thread.author_username}`} className="text-sm font-semibold hover:text-brand hover:underline">
                    {thread.author_name}
                  </Link>
                  <TitleBadge customTitle={thread.author_title} postCount={authorPostCount} />
                </>
              )}
              {thread.anonymous === 1 && isAdmin && (
                <span className="pill bg-soft text-muted">
                  匿名帖 · 实际作者：{thread.author_name}（仅管理员可见）
                </span>
              )}
            </div>
            <Markdown content={thread.content} className="mt-2 text-[15px] leading-7" />
            {postImages.length > 0 && (
              <div className={`mt-3 grid gap-2 ${postImages.length === 1 ? "" : "grid-cols-2 sm:grid-cols-3"}`}>
                {postImages.map((src) => (
                  <a
                    key={src}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-md border border-line bg-soft"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt="帖子图片"
                      loading="lazy"
                      className={
                        postImages.length === 1
                          ? "max-h-[480px] w-full object-contain"
                          : "h-40 w-full object-cover"
                      }
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          {user ? (
            <form action={toggleLikeAction}>
              <input type="hidden" name="thread_id" value={thread.id} />
              <SubmitButton
                className={`btn !border-red-500/30 !bg-red-500/10 !text-red-600 dark:!text-red-400 ${liked ? "" : "opacity-80"}`}
                pendingText="…"
              >
                <IconHeart filled={liked} /> {liked ? "已赞" : "点赞"} · {likeCount}
              </SubmitButton>
            </form>
          ) : (
            <Link href="/login" className="btn">
              <IconHeart /> 点赞 · {likeCount}
            </Link>
          )}
          {user ? (
            <form action={toggleFavoriteAction}>
              <input type="hidden" name="thread_id" value={thread.id} />
              <SubmitButton
                className={`btn !border-amber-500/30 !bg-amber-500/10 !text-amber-600 dark:!text-amber-400 ${faved ? "" : "opacity-80"}`}
                pendingText="…"
              >
                <IconStar filled={faved} /> {faved ? "已收藏" : "收藏"}
              </SubmitButton>
            </form>
          ) : (
            <Link href="/login" className="btn">
              <IconStar /> 收藏
            </Link>
          )}

          {user && user.id === thread.author_id && (
            <form action={deleteOwnThreadAction} className={isAdmin ? "" : "ml-auto"}>
              <input type="hidden" name="thread_id" value={thread.id} />
              <ConfirmSubmit
                className="btn-danger"
                message="确定删除这篇帖子？回复与图片将一并删除，且不可恢复。"
                confirmText="确认删除？"
              >
                删除
              </ConfirmSubmit>
            </form>
          )}

          {isAdmin && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
              <form action={togglePinAction}>
                <input type="hidden" name="thread_id" value={thread.id} />
                <button type="submit" className="btn-xs">{thread.is_pinned === 1 ? "取消置顶" : "置顶"}</button>
              </form>
              <form action={toggleFeatureAction}>
                <input type="hidden" name="thread_id" value={thread.id} />
                <button type="submit" className="btn-xs">{thread.is_featured === 1 ? "取消精华" : "加精"}</button>
              </form>
              <form action={deleteThreadAction}>
                <input type="hidden" name="thread_id" value={thread.id} />
                <ConfirmSubmit className="btn-danger" message="确定删除该帖子及全部回复？此操作不可恢复。">
                  删除
                </ConfirmSubmit>
              </form>
            </span>
          )}
        </div>
      </article>

      {/* 回复列表 */}
      <section className="card mt-4">
        <div className="card-header">💬 全部回复（{replies.length}）</div>
        {replies.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted">还没有回复，抢个沙发？</p>
        ) : (
          <ol className="divide-y divide-line">
            {replies.map((r, i) => (
              <li key={r.id} id={`reply-${r.id}`} className="flex scroll-mt-24 gap-3 px-4 py-3">
                <Link href={`/u/${r.username}`} className="shrink-0">
                  <Avatar user={r} size={32} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Link href={`/u/${r.username}`} className="text-sm font-semibold text-ink hover:text-brand hover:underline">
                      {r.nickname}
                    </Link>
                    <TitleBadge customTitle={r.custom_title} postCount={r.post_count} />
                    <span>{timeAgo(r.created_at)}</span>
                    {user && (
                      <Link
                        href={`/t/${thread.id}?quote=${r.id}#reply-form`}
                        className="text-brand/80 hover:text-brand hover:underline"
                      >
                        引用
                      </Link>
                    )}
                    <span className="ml-auto">{i + 1} 楼</span>
                  </div>
                  {(() => {
                    const ref = r.reply_to ? floorMap.get(r.reply_to) : undefined;
                    if (!ref) return null;
                    return (
                      <div className="mb-2 rounded-md border-l-4 border-brand/50 bg-soft/70 px-3 py-1.5 text-xs text-muted">
                        回复 <span className="font-semibold text-brand">@{ref.nickname}</span> 的 #{ref.floor}{" "}
                        楼：
                        <span className="ml-1">
                          {ref.content.slice(0, 60)}
                          {ref.content.length > 60 ? "…" : ""}
                        </span>
                      </div>
                    );
                  })()}
                  <Markdown content={r.content} className="mt-1 text-sm leading-6" />
                  {(() => {
                    let imgs: string[] = [];
                    try {
                      imgs = r.images ? (JSON.parse(r.images) as string[]) : [];
                    } catch {
                      imgs = [];
                    }
                    if (!imgs.length) return null;
                    return (
                      <div className={`mt-2 grid gap-2 ${imgs.length === 1 ? "" : "grid-cols-2"}`}>
                        {imgs.map((src) => (
                          <a
                            key={src}
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-md border border-line bg-soft"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src}
                              alt="回复图片"
                              loading="lazy"
                              className="max-h-64 w-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 回复框 */}
      {user ? (
        !thread.grade_lock || isAdmin || user.grade === thread.grade_lock ? (
          <ReplyForm threadId={thread.id} nickname={user.nickname} quote={quote} />
        ) : (
          <div className="card mt-4 p-6 text-center text-sm text-muted">
            🔒 「{thread.board_name}」是年级群，仅限{thread.grade_lock}同学回复
            {user.grade ? `（你当前是${user.grade}）` : "（你还未填写年级）"}
            ，可在{" "}
            <Link href="/settings" className="link">
              账号设置
            </Link>{" "}
            中确认年级；如有需要传达的消息，请找管理员代发。
          </div>
        )
      ) : (
        <div className="card mt-4 p-6 text-center text-sm text-muted">
          <Link href="/login" className="btn-primary mr-2">
            登录
          </Link>
          或
          <Link href="/register" className="btn ml-2">
            注册
          </Link>
          后参与回复
        </div>
      )}
    </div>
  );
}
