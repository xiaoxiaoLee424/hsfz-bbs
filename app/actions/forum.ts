"use server";

import {claimInline} from "@/lib/inline-uploads";
import {visibleContent} from "@/lib/content-policy";
import { normalizeVisibility } from "@/lib/visibility";
import {saveReferences} from "@/lib/forum-features";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { nowStr } from "@/lib/format";
import { saveUploadImage, removeUploadFile } from "@/lib/upload";
import { notify, mentionUserIds } from "@/lib/notify";
import { findSensitiveWord } from "@/lib/moderation";
import { AttachmentError, attachmentTransaction, prepareAttachments, persistAttachments, deleteThreadAttachments, deleteReplyAttachments } from "@/lib/attachments";
import { DOCUMENT_LIMITS } from "@/lib/attachment-limits";
import type { ActionState } from "./auth";

const fail = (message: string): ActionState => ({ message, ok: false });

function uploadedFiles(formData: FormData, field: string): File[] {
  // Unselected multipart inputs can arrive as zero-byte files with synthesized names.
  return formData.getAll(field).filter((value): value is File =>
    value instanceof File && value.size > 0
  );
}

function imageUrls(rows: Array<{ images: string }>): string[] {
  return rows.flatMap(({ images }) => {
    try {
      const parsed: unknown = JSON.parse(images || "[]");
      return Array.isArray(parsed) ? parsed.filter((url): url is string => typeof url === "string") : [];
    } catch {
      return [];
    }
  });
}

export async function createThreadAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return fail("请先登录后再发帖");
  const boardId = Number(formData.get("board_id"));
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").replace(/\r\n?/g,"\n").trim();
  if (!boardId) return fail("请选择板块");
  if (title.length < 2 || title.length > 60) return fail("标题长度需在 2-60 字之间");
  if (content.length > 20000) return fail("正文不能超过 20000 字");
  if (content.length < 2) return fail("正文太短啦，多写一点");
  const board = db.prepare("SELECT * FROM boards WHERE id = ?").get(boardId) as
    | { id: number; slug: string; name: string; grade_lock: string }
    | undefined;
  if (!board) return fail("板块不存在");
  if (board.slug === "announcements" && user.role !== "admin")
    return fail("只有管理员可以在站务公告板块发帖");
  if (board.grade_lock && user.role !== "admin" && user.grade !== board.grade_lock)
    return fail(
      `「${board.name}」是年级群，仅限${board.grade_lock}同学发言` +
        (user.grade ? `（你当前是${user.grade}）` : "（你还未填写年级）") +
        "，请通过「我的消息」发工单申请更正年级"
    );

  const sensitive = findSensitiveWord(`${title}\n${content}`);
  if (sensitive) return fail(`内容包含敏感词「${sensitive}」，请修改后重发`);
  // 图片附件（最多 4 张，浏览器端已压缩）
  const files = uploadedFiles(formData, "images");
  const documents = uploadedFiles(formData, "attachments");
  if (files.length > 4) return fail("图片最多 4 张");
  if ([...files, ...documents].reduce((total, file) => total + file.size, 0) > DOCUMENT_LIMITS.maxSubmissionBytes)
    return fail("图片和附件合计不能超过 10MB");
  const imagePaths: string[] = [];
  let prepared: Awaited<ReturnType<typeof prepareAttachments>>;
  try {
    prepared = await prepareAttachments(documents);
    for (const f of files) imagePaths.push(await saveUploadImage(f, "post"));
  } catch (e) {
    await Promise.all(imagePaths.map(removeUploadFile));
    return fail(e instanceof Error ? e.message : "图片保存失败，请重试");
  }

  // 匿名发表：仅表白墙板块支持
  const anonymous = formData.get("anonymous") === "on" && board.slug === "confession" ? 1 : 0;
  // 可见范围：所有人 / 仅关注者 / 仅自己
  const visibility = normalizeVisibility(formData.get("visibility"));

  let newThreadId: number;
  try {
    newThreadId = attachmentTransaction(() => {
      const info = db
        .prepare(
          `INSERT INTO threads (board_id, author_id, title, content, images, anonymous, visibility, created_at, last_reply_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          boardId,
          user.id,
          title,
          content,
          imagePaths.length ? JSON.stringify(imagePaths) : "",
          anonymous,
          visibility,
          nowStr(),
          nowStr()
        );
      const createdId = Number(info.lastInsertRowid);
      persistAttachments(prepared, user.id, createdId);
      saveReferences(content,createdId,0,user);
      claimInline(content,user.id,createdId,0,DOCUMENT_LIMITS.maxSubmissionBytes-[...files,...documents].reduce((n,f)=>n+f.size,0),4-files.length,3-documents.length,DOCUMENT_LIMITS.maxTotalBytes-documents.reduce((n,f)=>n+f.size,0));
      // 匿名帖不发送 @提及通知，避免暴露作者
      if (!anonymous) {
        mentionUserIds(content, user.id).forEach((uid) =>
          notify(uid, "mention", user.id, createdId, 0, `在《${title}》中提到了你`)
        );
      }
      return createdId;
    });
  } catch (error) {
    await Promise.all(imagePaths.map(removeUploadFile));
    return fail(error instanceof AttachmentError ? error.message : "帖子或附件保存失败，请稍后重试");
  }
  revalidatePath("/", "layout");
  redirect(`/t/${newThreadId}`);
}

export async function createReplyAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return fail("请先登录后再回复");
  const threadId = Number(formData.get("thread_id"));
  const content = String(formData.get("content") ?? "").replace(/\r\n?/g,"\n").trim();
  if (!threadId) return fail("帖子不存在");
  if (!content) return fail("回复内容不能为空");
  if (content.length > 10000) return fail("回复不能超过 10000 字");
  const thread = db
    .prepare(
      `SELECT th.id, th.author_id, th.title, b.grade_lock, b.name AS board_name
       FROM threads th JOIN boards b ON b.id = th.board_id WHERE th.id = ?`
    )
    .get(threadId) as
    | { id: number; author_id: number; title: string; grade_lock: string; board_name: string }
    | undefined;
  if (!thread || !visibleContent(user,threadId)) return fail("帖子不存在或不可见");
  if (thread.grade_lock && user.role !== "admin" && user.grade !== thread.grade_lock)
    return fail(
      `该帖位于年级群「${thread.board_name}」，仅限${thread.grade_lock}同学回复，请通过「我的消息」发工单申请更正年级`
    );

  // 引用回复：校验被引用楼层属于本帖
  const replyTo = Number(formData.get("reply_to")) || 0;
  // 可见范围：所有人 / 仅关注者 / 仅自己
  const visibility = normalizeVisibility(formData.get("visibility"));
  if (replyTo && !visibleContent(user,threadId,replyTo)) {
    return fail("引用的楼层不存在或已被删除");
  }

  const sensitive = findSensitiveWord(content);
  if (sensitive) return fail(`内容包含敏感词「${sensitive}」，请修改后重发`);
  // 回复图片（最多 2 张，浏览器端已压缩）
  const files = uploadedFiles(formData, "images");
  const documents = uploadedFiles(formData, "attachments");
  if (files.length > 2) return fail("回复图片最多 2 张");
  if ([...files, ...documents].reduce((total, file) => total + file.size, 0) > DOCUMENT_LIMITS.maxSubmissionBytes)
    return fail("图片和附件合计不能超过 10MB");
  const imagePaths: string[] = [];
  let prepared: Awaited<ReturnType<typeof prepareAttachments>>;
  try {
    prepared = await prepareAttachments(documents);
    for (const f of files) imagePaths.push(await saveUploadImage(f, "reply"));
  } catch (e) {
    await Promise.all(imagePaths.map(removeUploadFile));
    return fail(e instanceof Error ? e.message : "图片保存失败，请重试");
  }

  try {
    attachmentTransaction(() => {
      // Upload processing yields to other requests; the thread may have been deleted meanwhile.
      if (!visibleContent(user,threadId)) {
        throw new AttachmentError("帖子不存在或已删除");
      }
      if (replyTo && !visibleContent(user,threadId,replyTo)) {
        throw new AttachmentError("引用的楼层不存在或已被删除");
      }
      const info = db
        .prepare(
          "INSERT INTO replies (thread_id, author_id, content, images, reply_to, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          threadId,
          user.id,
          content,
          imagePaths.length ? JSON.stringify(imagePaths) : "",
          replyTo,
          visibility,
          nowStr()
        );
      const lastReplyId = Number(info.lastInsertRowid);
      db.prepare("UPDATE replies SET reply_target_set=? WHERE id=?").run(replyTo || formData.get("reply_target_set")==="1"?1:0,lastReplyId);
      persistAttachments(prepared, user.id, threadId, lastReplyId);
      saveReferences(content,threadId,lastReplyId,user);
      if(replyTo) db.prepare("INSERT OR IGNORE INTO content_references VALUES(?,?,?,?,'reply')").run(threadId,lastReplyId,threadId,replyTo);
      claimInline(content,user.id,threadId,lastReplyId,DOCUMENT_LIMITS.maxSubmissionBytes-[...files,...documents].reduce((n,f)=>n+f.size,0),2-files.length,3-documents.length,DOCUMENT_LIMITS.maxTotalBytes-documents.reduce((n,f)=>n+f.size,0));

      // 站内通知：回复帖主 / 引用楼层 / @提及
      notify(thread.author_id, "reply", user.id, threadId, lastReplyId, `回复了你的帖子《${thread.title}》`);
      if (replyTo) {
        const quoted = db
          .prepare("SELECT author_id FROM replies WHERE id = ? AND thread_id = ?")
          .get(replyTo, threadId) as { author_id: number } | undefined;
        if (quoted)
          notify(quoted.author_id, "quote", user.id, threadId, lastReplyId, `在《${thread.title}》中引用了你`);
      }
      mentionUserIds(content, user.id).forEach((uid) =>
        notify(uid, "mention", user.id, threadId, lastReplyId, `在《${thread.title}》中提到了你`)
      );

      db.prepare("UPDATE threads SET reply_count = reply_count + 1, last_reply_at = ? WHERE id = ?").run(
        nowStr(),
        threadId
      );
    });
  } catch (error) {
    await Promise.all(imagePaths.map(removeUploadFile));
    return fail(error instanceof AttachmentError ? error.message : "回复或附件保存失败，请稍后重试");
  }
  revalidatePath(`/t/${threadId}`);
  revalidatePath("/");
  return null;
}

/** 删除回复：作者本人、楼主、管理员可删。保留楼层占位，楼层号不变。 */
export async function deleteReplyAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const replyId = Number(formData.get("reply_id"));
  if (!Number.isSafeInteger(replyId) || replyId <= 0) return;
  const reply = db
    .prepare(
      `SELECT r.id, r.thread_id, r.author_id, r.images, r.deleted, t.author_id AS thread_author_id
       FROM replies r JOIN threads t ON t.id = r.thread_id WHERE r.id = ?`
    )
    .get(replyId) as
    | { id: number; thread_id: number; author_id: number; images: string; deleted: number; thread_author_id: number }
    | undefined;
  if (!reply || reply.deleted === 1) return;
  const allowed =
    user.id === reply.author_id || user.id === reply.thread_author_id || user.role === "admin";
  if (!allowed) return;

  // 先提交数据库（正文/图片清空、楼层数减一），提交成功后再删磁盘文件。
  const paths = attachmentTransaction(() => {
    const urls = imageUrls([{ images: reply.images }]);
    deleteReplyAttachments(replyId);
    db.prepare(
      "UPDATE replies SET deleted = 1, deleted_at = ?, content = '', images = '' WHERE id = ? AND deleted = 0"
    ).run(nowStr(), replyId);
    db.prepare("UPDATE threads SET reply_count = MAX(0, reply_count - 1) WHERE id = ?").run(reply.thread_id);
    // 指向这条回复的通知已经失去意义，一并清掉。
    db.prepare("DELETE FROM notifications WHERE reply_id = ?").run(replyId);
    return urls;
  });
  await Promise.all(paths.map(removeUploadFile));
  revalidatePath(`/t/${reply.thread_id}`);
  revalidatePath("/");
}

/** 作者删除自己的帖子（连同回复、点赞、收藏、图片） */
export async function deleteOwnThreadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const threadId = Number(formData.get("thread_id"));
  if (!threadId) return;
  const thread = db
    .prepare(
      `SELECT th.id, th.author_id, th.images, b.slug
       FROM threads th JOIN boards b ON b.id = th.board_id WHERE th.id = ?`
    )
    .get(threadId) as { id: number; author_id: number; images: string; slug: string } | undefined;
  // 只有作者本人能删自己的帖子
  if (!thread || thread.author_id !== user.id) return;
  // Keep files until the database deletion commits, so a failed delete leaves posts intact.
  const paths = attachmentTransaction(() => {
    const replyImgRows = db.prepare("SELECT images FROM replies WHERE thread_id = ? AND images != ''")
      .all(threadId) as { images: string }[];
    const urls = imageUrls([thread, ...replyImgRows]);
    deleteThreadAttachments(threadId);
    db.prepare("DELETE FROM notifications WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM replies WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM thread_likes WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM thread_favorites WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM threads WHERE id = ? AND author_id = ?").run(threadId, user.id);
    return urls;
  });
  await Promise.all(paths.map(removeUploadFile));
  revalidatePath("/", "layout");
  redirect(`/b/${thread.slug}`);
}

export async function toggleLikeAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const threadId = Number(formData.get("thread_id"));
  if (!Number.isSafeInteger(threadId) || threadId <= 0 || !visibleContent(user,threadId)) return;
  db.transaction(() => {
    const liked = db
      .prepare("SELECT 1 AS x FROM thread_likes WHERE user_id = ? AND thread_id = ?")
      .get(user.id, threadId);
    if (liked) {
      db.prepare("DELETE FROM thread_likes WHERE user_id = ? AND thread_id = ?").run(user.id, threadId);
      db.prepare("UPDATE threads SET like_count = MAX(0, like_count - 1) WHERE id = ?").run(threadId);
    } else {
      db.prepare("INSERT INTO thread_likes (user_id, thread_id) VALUES (?, ?)").run(user.id, threadId);
      db.prepare("UPDATE threads SET like_count = like_count + 1 WHERE id = ?").run(threadId);
      const t = db.prepare("SELECT author_id, title FROM threads WHERE id = ?").get(threadId) as
        | { author_id: number; title: string }
        | undefined;
      if (t) notify(t.author_id, "like", user.id, threadId, 0, `赞了你的帖子《${t.title}》`);
    }
  }).immediate();
  revalidatePath(`/t/${threadId}`);
  revalidatePath("/");
}

export async function toggleFavoriteAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const threadId = Number(formData.get("thread_id"));
  if (!Number.isSafeInteger(threadId) || threadId <= 0 || !visibleContent(user,threadId)) return;
  db.transaction(() => {
    const faved = db
      .prepare("SELECT 1 AS x FROM thread_favorites WHERE user_id = ? AND thread_id = ?")
      .get(user.id, threadId);
    if (faved)
      db.prepare("DELETE FROM thread_favorites WHERE user_id = ? AND thread_id = ?").run(user.id, threadId);
    else db.prepare("INSERT INTO thread_favorites (user_id, thread_id) VALUES (?, ?)").run(user.id, threadId);
  }).immediate();
  revalidatePath(`/t/${threadId}`);
}
