import { db } from "./db";

export type ThreadRow = {
  id: number; board_id: number; author_id: number; title: string; content: string;
  images: string; anonymous: number;
  views: number; reply_count: number; is_pinned: number; is_featured: number;
  created_at: string; last_reply_at: string;
  slug: string; board_name: string; board_icon: string; grade_lock: string;
  author_name: string; author_username: string; author_avatar: string; author_title: string;
  like_count: number;
};

const THREAD_SELECT = `
  SELECT t.*, b.slug, b.name AS board_name, b.icon AS board_icon, b.grade_lock,
         u.nickname AS author_name, u.username AS author_username,
         u.avatar AS author_avatar, u.custom_title AS author_title,
         (SELECT COUNT(*) FROM thread_likes l WHERE l.thread_id = t.id) AS like_count
  FROM threads t
  JOIN boards b ON b.id = t.board_id
  JOIN users u ON u.id = t.author_id
`;

function rows(sql: string, ...args: unknown[]): ThreadRow[] {
  return db.prepare(sql).all(...args) as ThreadRow[];
}

export function latestThreads(limit = 20): ThreadRow[] {
  return rows(
    `${THREAD_SELECT} ORDER BY t.is_pinned DESC, COALESCE(NULLIF(t.last_reply_at,''), t.created_at) DESC LIMIT ?`,
    limit
  );
}

export function boardThreads(boardId: number): ThreadRow[] {
  return rows(
    `${THREAD_SELECT} WHERE t.board_id = ? ORDER BY t.is_pinned DESC, COALESCE(NULLIF(t.last_reply_at,''), t.created_at) DESC`,
    boardId
  );
}

export function threadById(id: number): ThreadRow | undefined {
  return db.prepare(`${THREAD_SELECT} WHERE t.id = ?`).get(id) as ThreadRow | undefined;
}

export function hotThreads(limit = 5): ThreadRow[] {
  return rows(
    `${THREAD_SELECT} ORDER BY t.reply_count * 3 + (SELECT COUNT(*) FROM thread_likes l WHERE l.thread_id = t.id) * 2 + t.views * 0.05 DESC LIMIT ?`,
    limit
  );
}

export function featuredThreads(limit = 25): ThreadRow[] {
  return rows(`${THREAD_SELECT} WHERE t.is_featured = 1 ORDER BY t.created_at DESC LIMIT ?`, limit);
}

export function searchThreads(q: string): ThreadRow[] {
  const like = `%${q}%`;
  return rows(`${THREAD_SELECT} WHERE t.title LIKE ? OR t.content LIKE ? ORDER BY t.created_at DESC LIMIT 50`, like, like);
}

export function userThreads(userId: number): ThreadRow[] {
  // 匿名帖不在个人主页展示，避免暴露作者
  return rows(`${THREAD_SELECT} WHERE t.author_id = ? AND t.anonymous = 0 ORDER BY t.created_at DESC`, userId);
}

export function userReplies(userId: number) {
  return db
    .prepare(
      `SELECT r.*, t.title AS thread_title, t.id AS tid, b.slug, b.name AS board_name
       FROM replies r JOIN threads t ON t.id = r.thread_id JOIN boards b ON b.id = t.board_id
       WHERE r.author_id = ? ORDER BY r.created_at DESC`
    )
    .all(userId) as Array<{
      id: number; content: string; created_at: string; thread_title: string; tid: number; slug: string; board_name: string;
    }>;
}

export function userFavorites(userId: number): ThreadRow[] {
  return rows(
    `${THREAD_SELECT} JOIN thread_favorites f ON f.thread_id = t.id AND f.user_id = ?
     ORDER BY t.created_at DESC`,
    userId
  );
}

export function threadReplies(threadId: number) {
  return db
    .prepare(
      `SELECT r.*, u.nickname, u.username, u.avatar, u.custom_title,
        (SELECT COUNT(*) FROM threads th WHERE th.author_id = u.id) +
        (SELECT COUNT(*) FROM replies rp WHERE rp.author_id = u.id) AS post_count
       FROM replies r JOIN users u ON u.id = r.author_id
       WHERE r.thread_id = ? ORDER BY r.created_at ASC`
    )
    .all(threadId) as Array<{
      id: number; content: string; images: string; reply_to: number; created_at: string; nickname: string; username: string;
      avatar: string; custom_title: string; post_count: number;
    }>;
}

export type BoardRow = {
  id: number; slug: string; name: string; description: string; icon: string; category: string; sort: number;
  grade_lock: string;
  thread_count: number;
};

export function allBoards(): BoardRow[] {
  return db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id) AS thread_count
       FROM boards b ORDER BY b.sort ASC`
    )
    .all() as BoardRow[];
}

export function boardBySlug(slug: string): BoardRow | undefined {
  return db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id) AS thread_count
       FROM boards b WHERE b.slug = ?`
    )
    .get(slug) as BoardRow | undefined;
}

export function siteStats() {
  return db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM users WHERE status='approved' AND banned=0 AND role!='admin') AS users,
              (SELECT COUNT(*) FROM threads) AS threads,
              (SELECT COUNT(*) FROM replies) AS replies,
              (SELECT COUNT(*) FROM threads WHERE created_at >= date('now','localtime','-1 day')) AS recent`
    )
    .get() as { users: number; threads: number; replies: number; recent: number };
}

export function getUserByUsername(username: string) {
  // 永不返回 password_hash：该对象会作为 props 传给客户端组件（序列化到浏览器）
  return db
    .prepare(
      `SELECT id, username, nickname, avatar, custom_title, role, status, banned, grade, bio, created_at
       FROM users WHERE username = ?`
    )
    .get(username) as
    | {
        id: number; username: string; nickname: string; avatar: string; custom_title: string;
        role: string; status: string; banned: number; grade: string; bio: string; created_at: string;
      }
    | undefined;
}

export function likesReceived(userId: number): number {
  return (db
    .prepare(
      `SELECT COUNT(*) AS c FROM thread_likes l JOIN threads t ON t.id = l.thread_id WHERE t.author_id = ?`
    )
    .get(userId) as { c: number }).c;
}

export function unreadTicketCount(userId: number): number {
  return (db
    .prepare(
      `SELECT COUNT(*) AS c FROM tickets t
       WHERE t.user_id = ? AND t.status != 'closed'
         AND EXISTS (SELECT 1 FROM ticket_messages m
                     WHERE m.ticket_id = t.id AND m.is_admin = 1 AND m.created_at > t.user_read_at)`
    )
    .get(userId) as { c: number }).c;
}

/** 我的消息红圈 = 未读工单回复 + 未读站内通知 */
export function unreadNotificationCount(userId: number): number {
  return (db
    .prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0")
    .get(userId) as { c: number }).c;
}

export function followStats(userId: number, viewerId?: number) {
  const followers = (db
    .prepare("SELECT COUNT(*) AS c FROM follows WHERE following_id = ?")
    .get(userId) as { c: number }).c;
  const following = (db
    .prepare("SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?")
    .get(userId) as { c: number }).c;
  const isFollowing = viewerId
    ? !!db
        .prepare("SELECT 1 AS x FROM follows WHERE follower_id = ? AND following_id = ?")
        .get(viewerId, userId)
    : false;
  return { followers, following, isFollowing };
}

export function openTicketCount(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'").get() as { c: number }).c;
}

/** 首页排序：latest 最新 / reply 最多回复 / likes 最多点赞 / views 最多浏览 */
export function threadsSorted(sort: string, limit = 25): ThreadRow[] {
  const order =
    sort === "likes"
      ? "(SELECT COUNT(*) FROM thread_likes l WHERE l.thread_id = t.id) DESC"
      : sort === "views"
        ? "t.views DESC"
        : sort === "reply"
          ? "t.reply_count DESC"
          : "t.is_pinned DESC, COALESCE(NULLIF(t.last_reply_at,''), t.created_at) DESC";
  return rows(`${THREAD_SELECT} ORDER BY ${order} LIMIT ?`, limit);
}

/** 站务公告板块的帖子（游客可见） */
export function announcementThreads(limit = 5): ThreadRow[] {
  return rows(
    `${THREAD_SELECT} WHERE b.slug = 'announcements' ORDER BY t.created_at DESC LIMIT ?`,
    limit
  );
}
