import { db } from "./db";

export function hasBlocked(userId: number, targetId: number): boolean {
  return !!db.prepare("SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?").get(userId, targetId);
}

/** Either participant's block prevents new text and file messages in both directions. */
export function isBlocked(a: number, b: number): boolean {
  return hasBlocked(a, b) || hasBlocked(b, a);
}

export function toggleBlock(userId: number, targetId: number): "blocked" | "unblocked" {
  if (hasBlocked(userId, targetId)) {
    db.prepare("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?").run(userId, targetId);
    return "unblocked";
  }
  db.prepare("INSERT INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, datetime('now','localtime'))").run(userId, targetId);
  return "blocked";
}

/** Preserve the existing header/messages unread API after the conversation migration. */
export function unreadDmCount(userId: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM direct_messages m
    JOIN direct_conversations c ON c.id = m.conversation_id
    WHERE (c.user_low = ? OR c.user_high = ?) AND m.sender_id != ?
      AND m.id > COALESCE((SELECT last_message_id FROM direct_reads
        WHERE conversation_id = c.id AND user_id = ?), 0)`)
    .get(userId, userId, userId, userId) as { n: number }).n;
}
