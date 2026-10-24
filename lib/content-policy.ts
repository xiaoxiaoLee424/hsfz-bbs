import { db } from "./db";
import type { SessionUser } from "./auth";
import { canViewVisibility } from "./visibility";

/** 访问者关注了哪些作者：判定「仅关注者」内容时按需查询一次。 */
function followedAuthorIdsOf(userId: number): Set<number> {
  return new Set(
    (
      db.prepare("SELECT following_id FROM follows WHERE follower_id = ?").all(userId) as Array<{
        following_id: number;
      }>
    ).map((row) => row.following_id),
  );
}

/** 判断某条内容对当前访问者是否可访问：游客仅能看公告主帖；楼层须存在、未删除且属于该帖；
 * 帖子与楼层各自的可见范围（所有人 / 仅关注者 / 仅自己）按访问者身份与关注关系判定。 */
export function visibleContent(
  user: SessionUser | null,
  threadId: number,
  replyId = 0,
) {
  const thread = db
    .prepare(
      `SELECT t.*, b.slug FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.id=?`,
    )
    .get(threadId) as
    | {
        id: number;
        author_id: number;
        slug: string;
        anonymous: number;
        visibility: string;
        title: string;
        content: string;
      }
    | undefined;
  if (!thread || (!user && (thread.slug !== "announcements" || replyId)))
    return null;
  // canViewVisibility 拿不到关注集合时 followers 一律判否，因此失败且目标为
  // followers 时补查关注关系再判一次；帖子与楼层共用这一次查询。
  let followed: Set<number> | undefined;
  const canSee = (visibility: string | undefined, authorId: number): boolean => {
    if (canViewVisibility(visibility ?? "public", authorId, user, followed))
      return true;
    if (user && visibility === "followers" && !followed) {
      followed = followedAuthorIdsOf(user.id);
      return canViewVisibility(visibility, authorId, user, followed);
    }
    return false;
  };
  if (!canSee(thread.visibility, thread.author_id)) return null;
  if (!replyId) return thread;
  const reply = db
    .prepare("SELECT * FROM replies WHERE id=? AND thread_id=? AND deleted=0")
    .get(replyId, threadId) as
    | { author_id: number; visibility: string; content: string }
    | undefined;
  if (!reply || !canSee(reply.visibility, reply.author_id)) return null;
  return { ...thread, ...reply };
}
