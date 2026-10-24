/* eslint-disable @next/next/no-img-element -- Local avatars and emoji assets retain native sizing. */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, userPostCount } from "@/lib/db";
import { threadById, threadReplies } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { visibleContent } from "@/lib/content-policy";
import { canViewVisibility, VISIBILITY_LABEL } from "@/lib/visibility";
import { allowAction } from "@/lib/ratelimit";
import { Avatar } from "@/components/Avatar";
import { TitleBadge } from "@/components/TitleBadge";
import { ConfirmSubmit, SubmitButton } from "@/components/SubmitButton";
import { Markdown } from "@/components/Markdown";
import { ContentExtras } from "@/components/ContentExtras";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { ReplyForm } from "@/components/ReplyForm";
import { AttachmentList } from "@/components/AttachmentList";
import { attachmentsForThread } from "@/lib/attachments";
import { contentExcerpt } from "@/lib/forum-syntax";
import { timeAgo } from "@/lib/format";
import {
  deleteReplyAction,
  deleteOwnThreadAction,
  toggleFavoriteAction,
} from "@/app/actions/forum";
import {
  deleteThreadAction,
  togglePinAction,
  toggleFeatureAction,
} from "@/app/actions/admin";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  return { title: visibleContent(user, Number(id))?.title || "帖子" };
}
function Images({ value }: { value: string }) {
  const images: string[] = JSON.parse(value || "[]");
  return images.length ? (
    <div className="post-images">
      {images.map((src, index) => (
        <div key={src} className="post-image-item">
          <a href={src} target="_blank" rel="noreferrer">
            <img src={src} alt="帖子图片" loading="lazy" />
          </a>
          <a
            href={`${src}?download=1`}
            download
            aria-label={`下载帖子图片 ${index + 1}`}
            className="post-image-download"
          >
            下载
          </a>
        </div>
      ))}
    </div>
  ) : null;
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    tid = Number(id);
  if (!Number.isSafeInteger(tid) || tid <= 0) notFound();
  const thread = threadById(tid);
  if (!thread) notFound();
  const user = await getCurrentUser();
  if (!user && thread.slug !== "announcements") redirect("/login");
  if (!visibleContent(user, tid)) notFound();
  if (user && allowAction(`view:${user.id}:${tid}`, 300000).ok)
    db.prepare("UPDATE threads SET views=views+1 WHERE id=?").run(tid);
  // 可见范围判定需要访问者的关注列表（「仅关注者」内容）
  const followedAuthorIds = user
    ? new Set(
        (db.prepare("SELECT following_id FROM follows WHERE follower_id=?").all(user.id) as Array<{
          following_id: number;
        }>).map((row) => row.following_id),
      )
    : undefined;
  const replies = user
    ? threadReplies(tid).filter(
        (r) =>
          r.deleted === 0 &&
          canViewVisibility(r.visibility ?? "public", r.author_id, user, followedAuthorIds),
      )
    : [],
    attachments = attachmentsForThread(tid),
    admin = user?.role === "admin",
    anon = thread.anonymous === 1 && !admin;
  const author = anon ? "匿名同学" : thread.author_name,
    avatar = anon ? "" : thread.author_avatar;
  const direct = (reply: number) =>
    replies
      .filter((r) => r.reply_to === reply && (reply>0||r.reply_target_set===1))
      .map((r) => ({
        id: r.id,
        nickname: r.nickname,
        avatar: r.avatar,
        content: contentExcerpt(r.content),
      }));
  const faved =
    !!user &&
    !!db
      .prepare("SELECT 1 FROM thread_favorites WHERE thread_id=? AND user_id=?")
      .get(tid, user.id);
  const canReply =
    !!user && (!thread.grade_lock || admin || thread.grade_lock === user.grade);
  const more = (
    <>
      <form action={toggleFavoriteAction}>
        <input type="hidden" name="thread_id" value={tid} />
        <SubmitButton>{faved ? "取消收藏" : "收藏"}</SubmitButton>
      </form>
      {user?.id === thread.author_id && (
        <form action={deleteOwnThreadAction}>
          <input type="hidden" name="thread_id" value={tid} />
          <ConfirmSubmit message="确定删除帖子及回复？">删除帖子</ConfirmSubmit>
        </form>
      )}
      {admin && (
        <>
          <form action={togglePinAction}>
            <input type="hidden" name="thread_id" value={tid} />
            <button>{thread.is_pinned ? "取消置顶" : "置顶"}</button>
          </form>
          <form action={toggleFeatureAction}>
            <input type="hidden" name="thread_id" value={tid} />
            <button>{thread.is_featured ? "取消精华" : "加精"}</button>
          </form>
          <form action={deleteThreadAction}>
            <input type="hidden" name="thread_id" value={tid} />
            <ConfirmSubmit message="确定删除该帖子？">管理员删除</ConfirmSubmit>
          </form>
        </>
      )}
    </>
  );
  return (
    <div className="topic-timeline">
      <nav className="topic-breadcrumb">
        <Link href="/">首页</Link>
        <span>›</span>
        <Link href={`/b/${thread.slug}`}>{thread.board_name}</Link>
      </nav>
      <h1 className="topic-title">{thread.title}</h1>
      <div className="topic-summary">
        {thread.is_pinned ? "置顶 · " : ""}
        {thread.is_featured ? "精华 · " : ""}
        {thread.visibility && thread.visibility !== "public"
          ? `🔒 ${VISIBILITY_LABEL[thread.visibility] ?? thread.visibility} · `
          : ""}
        {thread.views} 浏览 · {replies.length} 回复
      </div>
      {canReply && <SelectionToolbar />}
      <article className="topic-post" id="post-0">
        <Avatar
          user={{
            nickname: author,
            username: anon ? "anonymous" : thread.author_username,
            avatar,
          }}
          size={40}
        />
        <div className="post-column">
          <header className="post-byline">
            <div>
              <span className="post-author">{author}</span>
              {!anon && (
                <TitleBadge
                  customTitle={thread.author_title}
                  postCount={userPostCount(thread.author_id)}
                />
              )}
            </div>
            <time>{timeAgo(thread.created_at)}</time>
          </header>
          <div
            data-quote-body={`${tid}-0`}
            data-quote-enabled={canReply ? `${tid}-0` : undefined}
          >
            <Markdown content={thread.content} />
          </div>
          <Images value={thread.images} />
          <AttachmentList
            attachments={attachments.filter((a) => a.replyId === 0)}
          />
          {user ? (
            <ContentExtras
              canReply={canReply}
              thread={tid}
              author={author}
              canQuote={canReply}
              directReplies={direct(0)}
              more={more}
            />
          ) : (
            <Link href="/login">登录参与讨论</Link>
          )}
        </div>
      </article>
      {replies.map((r) => {
        const target = r.reply_to
          ? replies.find((p) => p.id === r.reply_to)
          : null;
        return (
          <article className="topic-post" id={`reply-${r.id}`} key={r.id}>
            <Avatar user={r} size={40} />
            <div className="post-column">
              <header className="post-byline">
                <div>
                  <Link className="post-author" href={`/u/${r.username}`}>
                    {r.nickname}
                  </Link>
                  <TitleBadge
                    customTitle={r.custom_title}
                    postCount={r.post_count}
                  />
                </div>
                <div className="post-context">
                  {target ? (
                    <a href={`#reply-${target.id}`} className="reply-target">
                      ↩ <Avatar user={target} size={18} />
                      {target.nickname}
                    </a>
                  ) : r.reply_target_set && !r.reply_to ? (<a href="#post-0" className="reply-target">↩ <Avatar user={{nickname:author,username:anon?'anonymous':thread.author_username,avatar}} size={18}/>{author}</a>) : r.reply_to ? (
                    <span>↩ 回复目标不可访问</span>
                  ) : null}
                  <time>{timeAgo(r.created_at)}</time>
                </div>
              </header>
              <div
                data-quote-body={`${tid}-${r.id}`}
                data-quote-enabled={canReply ? `${tid}-${r.id}` : undefined}
              >
                <Markdown content={r.content} />
              </div>
              <Images value={r.images} />
              <AttachmentList
                attachments={attachments.filter((a) => a.replyId === r.id)}
              />
              {user && (
                <ContentExtras
                  canReply={canReply}
                  thread={tid}
                  reply={r.id}
                  author={r.nickname}
                  canQuote={canReply}
                  directReplies={direct(r.id)}
                  more={
                    admin ||
                    user.id === r.author_id ||
                    user.id === thread.author_id ? (
                      <form action={deleteReplyAction}>
                        <input type="hidden" name="reply_id" value={r.id} />
                        <ConfirmSubmit message="确认删除这条回复？">
                          删除回复
                        </ConfirmSubmit>
                      </form>
                    ) : undefined
                  }
                />
              )}
            </div>
          </article>
        );
      })}
      {canReply ? (
        <ReplyForm threadId={tid} nickname={user!.nickname} threadTitle={thread.title} />
      ) : (
        <p className="post-status">
          {user ? (
            "本年级群仅限对应年级发言"
          ) : (
            <Link href="/login">登录后回复</Link>
          )}
        </p>
      )}
    </div>
  );
}
