import { isBlocked } from "./dm";
import { findSensitiveWord } from "./moderation";
import { db } from "./db";
import { nowStr } from "./format";
import { attachmentInfo, insertAttachment, type PreparedAttachment } from "./attachments";
import type { AttachmentInfo } from "./file-transfer";

export class SocialError extends Error {}
function activeUser(id: number) {
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND status = 'approved' AND banned = 0").get(id);
  if (!user) throw new SocialError("账号不可用，请重新登录");
}
export function messageContent(value: string) {
  const content = value.trim();
  if (!content || content.length > 10000) throw new SocialError("消息需为 1–10,000 字");
  const word = findSensitiveWord(content);
  if (word) throw new SocialError(`消息包含敏感词「${word}」，请修改后重试`);
  return content;
}
export function conversationFor(id: number, userId: number) {
  return db.prepare(`SELECT c.*, u.username, u.nickname, u.avatar, u.banned, u.status
    FROM direct_conversations c JOIN users u ON u.id = CASE WHEN c.user_low = ? THEN c.user_high ELSE c.user_low END
    WHERE c.id = ? AND (c.user_low = ? OR c.user_high = ?)`)
    .get(userId, id, userId, userId) as { id: number; user_low: number; user_high: number; username: string; nickname: string; avatar: string; banned: number; status: string } | undefined;
}
export function startConversation(userId: number, username: string) {
  activeUser(userId);
  const recipient = db.prepare("SELECT id FROM users WHERE username = ? AND status = 'approved' AND banned = 0").get(username) as { id: number } | undefined;
  if (!recipient) throw new SocialError("找不到可接收私信的同学，请检查用户名");
  if (recipient.id === userId) throw new SocialError("不能给自己发送私信");
  const low = Math.min(userId, recipient.id), high = Math.max(userId, recipient.id);
  db.prepare("INSERT OR IGNORE INTO direct_conversations (user_low, user_high, created_at) VALUES (?, ?, ?)").run(low, high, nowStr());
  return (db.prepare("SELECT id FROM direct_conversations WHERE user_low = ? AND user_high = ?").get(low, high) as { id: number }).id;
}
export function assertDirectSendAccess(userId: number, id: number) {
  activeUser(userId);
  const conversation = conversationFor(id, userId);
  if (!conversation) throw new SocialError("会话不存在或你无权访问");
  const otherId = conversation.user_low === userId ? conversation.user_high : conversation.user_low;
  if (isBlocked(userId, otherId)) throw new SocialError("你或对方已拉黑，无法发送私信");
  if (conversation.banned || conversation.status !== "approved") throw new SocialError("对方当前无法接收私信");
}
export function sendDirectMessage(userId: number, id: number, value: string, attachment?: PreparedAttachment) {
  assertDirectSendAccess(userId, id);
  const content = attachment && !value.trim() ? "" : messageContent(value);
  return db.transaction(() => {
    const attachmentId = attachment ? insertAttachment(attachment) : "";
    return Number(db.prepare("INSERT INTO direct_messages (conversation_id, sender_id, content, created_at, attachment_id) VALUES (?, ?, ?, ?, ?)")
      .run(id, userId, content, nowStr(), attachmentId).lastInsertRowid);
  })();
}
export function directMessages(userId: number, id: number, before?: number) {
  if (!conversationFor(id, userId)) throw new SocialError("会话不存在或你无权访问");
  const messages = db.prepare(`SELECT * FROM (SELECT m.*, u.nickname, u.username, u.avatar FROM direct_messages m
    JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT 50) ORDER BY id`)
    .all(id, before || Number.MAX_SAFE_INTEGER) as ChatMessage[];
  return messages.map(message => ({ ...message, attachment: message.attachment_id ? attachmentInfo(message.attachment_id) : undefined }));
}
export type ChatMessage = { id: number; sender_id: number; content: string; created_at: string; nickname: string; username: string; avatar: string; attachment_id: string; attachment?: AttachmentInfo };
export function conversations(userId: number) {
  return db.prepare(`SELECT c.id, u.nickname, u.username, u.avatar,
    (SELECT CASE WHEN content = '' AND attachment_id != '' THEN '文件附件（上传后保留 10 分钟）' ELSE content END
      FROM direct_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS preview,
    COALESCE((SELECT created_at FROM direct_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1), c.created_at) AS updated_at,
    (SELECT COUNT(*) FROM direct_messages m WHERE m.conversation_id = c.id AND m.sender_id != ?
      AND m.id > COALESCE((SELECT last_message_id FROM direct_reads WHERE conversation_id = c.id AND user_id = ?), 0)) AS unread
    FROM direct_conversations c JOIN users u ON u.id = CASE WHEN c.user_low = ? THEN c.user_high ELSE c.user_low END
    WHERE c.user_low = ? OR c.user_high = ? ORDER BY updated_at DESC, c.id DESC`)
    .all(userId, userId, userId, userId, userId) as { id: number; nickname: string; username: string; avatar: string; preview: string | null; updated_at: string; unread: number }[];
}
export function unreadDirectCount(userId: number): number {
  return conversations(userId).reduce((sum, c) => sum + c.unread, 0);
}
export function markDirectRead(userId: number, id: number, lastId: number) {
  if (!conversationFor(id, userId)) throw new SocialError("无权访问此会话");
  const message = db.prepare("SELECT id FROM direct_messages WHERE conversation_id = ? AND id = ?").get(id, lastId);
  if (!message) return;
  db.prepare(`INSERT INTO direct_reads (conversation_id, user_id, last_message_id) VALUES (?, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_message_id = MAX(last_message_id, excluded.last_message_id)`)
    .run(id, userId, lastId);
}
export type Group = { id: number; name: string; description: string; owner_id: number; owner_name: string; created_at: string; member_count: number; message_count: number; joined: number; unread: number };
export function groups(userId = 0) {
  return db.prepare(`SELECT g.*, u.nickname AS owner_name,
    (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
    (SELECT COUNT(*) FROM group_messages WHERE group_id = g.id) AS message_count,
    EXISTS(SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = ?) AS joined,
    (SELECT COUNT(*) FROM group_messages m JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?
      WHERE m.group_id = g.id AND m.sender_id != ? AND m.id > gm.last_message_id) AS unread
    FROM community_groups g JOIN users u ON u.id = g.owner_id ORDER BY g.created_at DESC, g.id DESC`)
    .all(userId, userId, userId) as Group[];
}
export function groupById(id: number, userId = 0) {
  return groups(userId).find(g => g.id === id);
}
export function createGroup(userId: number, nameValue: string, descriptionValue: string) {
  activeUser(userId);
  const name = nameValue.trim(), description = descriptionValue.trim();
  if (name.length < 2 || name.length > 40) throw new SocialError("小组名称需为 2–40 字");
  if (description.length > 500) throw new SocialError("小组介绍最多 500 字");
  return db.transaction(() => {
    const id = Number(db.prepare("INSERT INTO community_groups (name, description, owner_id, created_at) VALUES (?, ?, ?, ?)").run(name, description, userId, nowStr()).lastInsertRowid);
    db.prepare("INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)").run(id, userId, nowStr());
    return id;
  })();
}
export function joinGroup(userId: number, id: number) {
  activeUser(userId);
  if (!groupById(id)) throw new SocialError("小组不存在");
  db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)").run(id, userId, nowStr());
}
export function leaveGroup(userId: number, id: number) {
  const group = groupById(id);
  if (!group) throw new SocialError("小组不存在");
  if (group.owner_id === userId) throw new SocialError("你是组长，需保留成员身份以管理小组");
  db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(id, userId);
}
export function isGroupMember(userId: number, id: number) {
  return !!db.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?").get(id, userId);
}
export function groupMembers(userId: number, id: number) {
  if (!isGroupMember(userId, id)) throw new SocialError("加入小组后才能查看成员");
  return db.prepare(`SELECT u.id, u.username, u.nickname, u.avatar FROM users u JOIN group_members gm ON gm.user_id = u.id
    WHERE gm.group_id = ? ORDER BY gm.joined_at, u.id`).all(id) as { id: number; username: string; nickname: string; avatar: string }[];
}
export function groupMessages(userId: number, id: number, before?: number) {
  if (!isGroupMember(userId, id)) throw new SocialError("加入小组后才能查看讨论");
  const messages = db.prepare(`SELECT * FROM (SELECT m.*, u.nickname, u.username, u.avatar FROM group_messages m JOIN users u ON u.id = m.sender_id
    WHERE m.group_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT 50) ORDER BY id`).all(id, before || Number.MAX_SAFE_INTEGER) as ChatMessage[];
  return messages.map(message => ({ ...message, attachment: message.attachment_id ? attachmentInfo(message.attachment_id) : undefined }));
}
export function assertGroupSendAccess(userId: number, id: number) {
  activeUser(userId);
  if (!isGroupMember(userId, id)) throw new SocialError("加入小组后才能发言");
}
export function sendGroupMessage(userId: number, id: number, value: string, attachment?: PreparedAttachment) {
  assertGroupSendAccess(userId, id);
  const content = attachment && !value.trim() ? "" : messageContent(value);
  return db.transaction(() => {
    const attachmentId = attachment ? insertAttachment(attachment) : "";
    return Number(db.prepare("INSERT INTO group_messages (group_id, sender_id, content, created_at, attachment_id) VALUES (?, ?, ?, ?, ?)")
      .run(id, userId, content, nowStr(), attachmentId).lastInsertRowid);
  })();
}
export function markGroupRead(userId: number, id: number, lastId: number) {
  if (!isGroupMember(userId, id)) throw new SocialError("无权访问此小组");
  if (!db.prepare("SELECT id FROM group_messages WHERE group_id = ? AND id = ?").get(id, lastId)) return;
  db.prepare("UPDATE group_members SET last_message_id = MAX(last_message_id, ?) WHERE group_id = ? AND user_id = ?").run(lastId, id, userId);
}
