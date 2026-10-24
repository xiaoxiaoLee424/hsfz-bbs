import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getUserByUsername,
  userThreads,
  userReplies,
  userFavorites,
  likesReceived,
} from "@/lib/queries";
import { userPostCount } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { followStats, followList } from "@/lib/queries";
import { toggleFollowAction } from "@/app/actions/follow";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { TitleBadge } from "@/components/TitleBadge";
import { ThreadList } from "@/components/ThreadList";
import { timeAgo } from "@/lib/format";
import { LEVELS, getLevel } from "@/lib/titles";

function TabLink({ name, label, count, username, activeTab }: { name: string; label: string; count?: number; username: string; activeTab: string }) {
  return (
    <Link
      href={`/u/${username}?tab=${name}`}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
        activeTab === name ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1 text-xs text-muted">{count}</span>}
    </Link>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const u = (await getCurrentUser()) ? getUserByUsername(username) : undefined;
  return { title: u ? `${u.nickname}（@${u.username}）` : "用户" };
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireUser();
  const { username } = await params;
  const { tab } = await searchParams;
  const profile = getUserByUsername(username);
  if (!profile) notFound();

  const fstats = followStats(profile.id, me?.id);
  const isSelf = me?.id === profile.id;
  const postCount = userPostCount(profile.id);
  const level = getLevel(postCount);
  const levelIndex = LEVELS.findIndex((l) => l.name === level.name);
  const nextLevel = levelIndex > 0 ? LEVELS[levelIndex - 1] : null;
  const progress = nextLevel ? Math.min(100, Math.round((postCount / nextLevel.min) * 100)) : 100;

  const followingList = followList(profile.id, "following");
  const followersList = followList(profile.id, "followers");
  const activeTab =
    tab === "replies"
      ? "replies"
      : isSelf && tab === "favorites"
        ? "favorites"
        : tab === "following" || tab === "followers"
          ? tab
          : "threads";
  const threads = userThreads(profile.id, me?.id ?? 0);
  const replies = userReplies(profile.id, me?.id ?? 0);
  const favorites = isSelf ? userFavorites(profile.id) : [];
  const likes = likesReceived(profile.id);



  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <Avatar user={profile} size={72} />
            {profile.avatar?.startsWith("/uploads/") && (
              <a href={`${profile.avatar}?download=1`} download className="text-xs text-brand hover:underline">
                下载头像
              </a>
            )}
          </div>
          {me && me.id !== profile.id && (
            <div className="ml-auto flex shrink-0 flex-col items-end gap-2">
              <Link href={`/dm/${profile.username}`} className="btn">
                💬 发私信
              </Link>
              <form action={toggleFollowAction}>
                <input type="hidden" name="user_id" value={profile.id} />
                <SubmitButton
                  className={fstats.isFollowing ? "btn w-full justify-center" : "btn-primary w-full justify-center"}
                >
                  {fstats.isFollowing ? "已关注" : "＋ 关注"}
                </SubmitButton>
              </form>
            </div>
          )}
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
              <Link
                href={`/u/${profile.username}?tab=following`}
                className="text-muted hover:text-brand hover:underline"
              >
                关注 <b className="text-ink">{fstats.following}</b>
              </Link>
              <Link
                href={`/u/${profile.username}?tab=followers`}
                className="text-muted hover:text-brand hover:underline"
              >
                粉丝 <b className="text-ink">{fstats.followers}</b>
              </Link>
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
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--tertiary)] to-[var(--tertiary-hover)]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex gap-5 border-b-[1.5px] border-line px-4 pt-3">
          <TabLink username={profile.username} activeTab={activeTab} name="threads" label="帖子" count={threads.length} />
          <TabLink username={profile.username} activeTab={activeTab} name="replies" label="回复" count={replies.length} />
          {isSelf && <TabLink username={profile.username} activeTab={activeTab} name="favorites" label="我的收藏" count={favorites.length} />}
          <TabLink username={profile.username} activeTab={activeTab} name="following" label="关注" count={fstats.following} />
          <TabLink username={profile.username} activeTab={activeTab} name="followers" label="粉丝" count={fstats.followers} />
        </div>

        {activeTab === "threads" && <ThreadList threads={threads} />}
        {activeTab === "favorites" && <ThreadList threads={favorites} />}
        {(activeTab === "following" || activeTab === "followers") && (
          <div className="card divide-y divide-line">
            {(activeTab === "following" ? followingList : followersList).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                {activeTab === "following" ? "还没有关注任何人" : "还没有粉丝，发帖互动就会有了"}
              </p>
            ) : (
              (activeTab === "following" ? followingList : followersList).map((u) => (
                <Link key={u.id} href={`/u/${u.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-soft/60">
                  <Avatar user={u} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.nickname}</p>
                    <p className="text-xs text-muted">@{u.username}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
        {activeTab === "replies" && (
          <ul className="divide-y-[1.5px] divide-line">
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
