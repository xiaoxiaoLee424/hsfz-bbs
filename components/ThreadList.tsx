import Link from "next/link";
import type { ThreadRow } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./Avatar";

export function ThreadList({ threads, showBoard = true }: { threads: ThreadRow[]; showBoard?: boolean }) {
  if (!threads.length) return <div className="empty-state"><h3>这里还很安静</h3><p>把你的问题或故事写下来，开启第一场讨论。</p><Link href="/new" className="link">发布帖子 ↗</Link></div>;
  return <div className="thread-list">{threads.map(t => <ThreadRowItem key={t.id} t={t} showBoard={showBoard} />)}</div>;
}
export function ThreadRowItem({ t, showBoard = true }: { t: ThreadRow; showBoard?: boolean }) {
  const anonymous = t.anonymous === 1;
  const author = { nickname: anonymous ? "匿名同学" : t.author_name, username: anonymous ? "anonymous" : t.author_username, avatar: anonymous ? "" : t.author_avatar };
  return <article className="thread-row">
    <div className="thread-avatar">{anonymous ? <Avatar user={author} size={36} /> : <Link href={`/u/${author.username}`} aria-label={`${author.nickname}的个人主页`}><Avatar user={author} size={36} /></Link>}</div>
    <div className="thread-main"><div className="thread-title-line"><Link href={`/t/${t.id}`} className="thread-title">{t.title}</Link>{t.is_pinned === 1 ? <span className="thread-status">置顶</span> : t.is_featured === 1 ? <span className="thread-status">精华</span> : null}</div>
      <div className="thread-meta">{showBoard && <Link href={`/b/${t.slug}`} className="board-tag">{t.board_name}</Link>}{anonymous ? <span>匿名同学</span> : <Link href={`/u/${author.username}`}>{author.nickname}</Link>}<span>{timeAgo(t.created_at)}</span><span className="thread-views">{t.views.toLocaleString()} 次浏览</span></div>
    </div><Link className="thread-replies" href={`/t/${t.id}#replies`} aria-label={`${t.reply_count} 条回复`}><b>{t.reply_count}</b><small>回复</small></Link>
  </article>;
}
