import { toggleFollowAction } from "@/app/actions/follow";
import { SubmitButton } from "@/components/SubmitButton";
import { IconLink } from "@/components/IconAction";
import { ScrollRow } from "@/components/ScrollRow";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getUserByUsername,
  userThreads,
  userReplies,
  userFavorites,
  likesReceived,
  followStats,
} from "@/lib/queries";
import { userPostCount } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { TitleBadge } from "@/components/TitleBadge";
import { ThreadList } from "@/components/ThreadList";
import { timeAgo } from "@/lib/format";
import { LEVELS, getLevel } from "@/lib/titles";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const u = getUserByUsername(username);
  return { title: u ? `${u.nickname}（@${u.username}）` : "用户" };
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  const { tab } = await searchParams;
  const profile = getUserByUsername(username);
  if (!profile) notFound();

  const me = await getCurrentUser();
  const fstats = followStats(profile.id, me?.id);
  const isSelf = me?.id === profile.id;
  const postCount = userPostCount(profile.id);
  const level = getLevel(postCount);
  const levelIndex = LEVELS.findIndex((l) => l.name === level.name);
  const nextLevel = levelIndex > 0 ? LEVELS[levelIndex - 1] : null;
  const progress = nextLevel ? Math.min(100, Math.round((postCount / nextLevel.min) * 100)) : 100;

  const activeTab = isSelf && tab === "favorites" ? "favorites" : tab === "replies" ? "replies" : "threads";
  const threads = userThreads(profile.id);
  const replies = userReplies(profile.id);
  const favorites = isSelf ? userFavorites(profile.id) : [];
  const likes = likesReceived(profile.id);

  const tabLink = ({ name, label, count }: { name: string; label: string; count?: number }) => (
    <Link
      href={`/u/${profile.username}?tab=${name}`}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
        activeTab === name ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1 text-xs text-muted">{count}</span>}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar user={profile} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{profile.nickname}</h1>
              <TitleBadge customTitle={profile.custom_title} postCount={postCount} />
              {profile.role === "admin" && <span className="pill bg-brand text-white">管理员</span>}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              @{profile.username}
              {profile.grade && ` · ${profile.grade}`}
            </p>
            <div className="mt-3 flex items-center gap-2">
            {!isSelf && me && <form action={toggleFollowAction}><input type="hidden" name="user_id" value={profile.id} /><SubmitButton icon={fstats.isFollowing ? "user-minus" : "user-plus"} active={fstats.isFollowing} className={fstats.isFollowing ? "btn" : "btn-primary"}>{fstats.isFollowing ? "取消关注" : "关注"}</SubmitButton></form>}
            {!isSelf && me && profile.status === "approved" && !profile.banned && <IconLink href={`/dm/${encodeURIComponent(profile.username)}`} className="btn" icon="message" label="发送私信" />}
            </div>
            {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="text-muted">
                主题 <b className="text-ink">{threads.length}</b>
              </span>
              <span className="text-muted">
                回复 <b className="text-ink">{replies.length}</b>
              </span>
              <span className="text-muted">
                获赞 <b className="text-ink">{likes}</b>
              </span>
              <span className="text-muted">关注 <b className="text-ink">{fstats.following}</b></span>
              <span className="text-muted">粉丝 <b className="text-ink">{fstats.followers}</b></span>
              <span className="text-muted">加入于 {profile.created_at.slice(0, 10)}</span>
            </div>
            {/* 等级进度 */}
            <div className="mt-3 max-w-xs">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  当前头衔等级：<b className="text-ink">{level.name}</b>
                </span>
                {nextLevel && (
                  <span>
                    再发 {nextLevel.min - postCount} 帖升级「{nextLevel.name}」
                  </span>
                )}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-soft">
                <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <ScrollRow as="nav" aria-label="个人主页内容" className="gap-5 border-b border-line px-4 pt-3">
          {tabLink({ name: "threads", label: "帖子", count: threads.length })}
          {tabLink({ name: "replies", label: "回复", count: replies.length })}
          {isSelf && tabLink({ name: "favorites", label: "我的收藏", count: favorites.length })}
        </ScrollRow>

        {activeTab === "threads" && <ThreadList threads={threads} />}
        {activeTab === "favorites" && <ThreadList threads={favorites} />}
        {activeTab === "replies" && (
          <ul className="divide-y divide-line">
            {replies.length === 0 && (
              <li className="px-4 py-10 text-center text-muted">还没有回复过</li>
            )}
            {replies.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Link href={`/b/${r.slug}`} className="pill bg-brand/10 text-brand hover:bg-brand hover:text-white">
                    {r.board_name}
                  </Link>
                  <span>{timeAgo(r.created_at)}</span>
                </div>
                <Link href={`/t/${r.tid}`} className="mt-1 block font-medium hover:text-brand hover:underline">
                  回复「{r.thread_title}」
                </Link>
                <p className="mt-0.5 line-clamp-2 text-muted">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
