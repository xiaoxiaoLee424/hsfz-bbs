"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

/** 管理员为用户重置密码（替代自助找回：同学找管理员人工核实后使用） */
export async function adminResetPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (admin.role !== "admin") return fail("仅管理员可操作");
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username) return fail("请输入用户名");
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return fail("临时密码至少 8 位，重置后请通知对方尽快修改");
  const row = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as
    | { id: number }
    | undefined;
  if (!row) return fail("用户不存在");
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    await bcrypt.hash(password, 10),
    row.id
  );
  destroyUserSessions(row.id);
  revalidatePath("/admin");
  return okMsg(`已重置 ${username} 的密码，其全部登录已退出。请通知对方用临时密码登录后尽快自行修改。`);
}


import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { db, setSetting, getSetting, UPLOAD_DIR, GRADES } from "@/lib/db";
import { saveUploadImage, removeUploadFile } from "@/lib/upload";
import { requireAdmin, destroyUserSessions } from "@/lib/auth";
import { attachmentTransaction, deleteThreadAttachments } from "@/lib/attachments";
import type { ActionState } from "./auth";

const fail = (message: string): ActionState => ({ message, ok: false });
const okMsg = (message: string): ActionState => ({ message, ok: true });

export async function approveUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("user_id"));
  if (!userId) return;
  db.transaction(() => {
    const user = db.prepare("SELECT real_name, student_id FROM users WHERE id = ?").get(userId) as { real_name: string; student_id: string } | undefined;
    if (!user) return;
    db.prepare("UPDATE whitelist SET used_by = ? WHERE real_name = ? AND student_id = ? AND used_by = 0").run(userId, user.real_name, user.student_id);
    db.prepare("UPDATE users SET status = 'approved', reject_reason = '' WHERE id = ?").run(userId);
  }).immediate();
  revalidatePath("/", "layout");
}

export async function rejectUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("user_id"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 60);
  if (!userId) return;
  db.prepare("UPDATE users SET status = 'rejected', reject_reason = ? WHERE id = ?").run(reason, userId);
  destroyUserSessions(userId);
  revalidatePath("/", "layout");
}

export async function banUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = Number(formData.get("user_id"));
  if (!userId || userId === admin.id) return;
  db.prepare("UPDATE users SET banned = 1 WHERE id = ?").run(userId);
  destroyUserSessions(userId);
  revalidatePath("/", "layout");
}

export async function unbanUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("user_id"));
  if (!userId) return;
  db.prepare("UPDATE users SET banned = 0 WHERE id = ?").run(userId);
  revalidatePath("/", "layout");
}

export async function setCustomTitleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("user_id"));
  const title = String(formData.get("custom_title") ?? "").trim().slice(0, 16);
  if (!userId) return;
  db.prepare("UPDATE users SET custom_title = ? WHERE id = ?").run(title, userId);
  revalidatePath("/", "layout");
}

export async function setAdminRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = Number(formData.get("user_id"));
  const makeAdmin = String(formData.get("make") ?? "") === "admin";
  if (!userId) return;
  const target = db
    .prepare("SELECT id, username, status, role FROM users WHERE id = ?")
    .get(userId) as { id: number; username: string; status: string; role: string } | undefined;
  if (!target) return;
  // 不能修改自己的角色；创始人账号（id=1 的首个管理员）角色不可被他人修改；仅可操作已批准的账号
  if (target.id === admin.id) return;
  if (target.id === 1) return;
  if (target.status !== "approved") return;
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(makeAdmin ? "admin" : "user", userId);
  revalidatePath("/", "layout");
}

export async function deleteThreadAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const threadId = Number(formData.get("thread_id"));
  if (!threadId) return;
  const row = db
    .prepare("SELECT t.images, b.slug FROM threads t JOIN boards b ON b.id = t.board_id WHERE t.id = ?")
    .get(threadId) as
    | { images: string; slug: string }
    | undefined;
  if (!row) return;
  const paths = attachmentTransaction(() => {
    const replyImgRows = db.prepare("SELECT images FROM replies WHERE thread_id = ? AND images != ''")
      .all(threadId) as { images: string }[];
    const urls = [row, ...replyImgRows].flatMap(({ images }) => {
      try {
        const parsed: unknown = JSON.parse(images || "[]");
        return Array.isArray(parsed) ? parsed.filter((url): url is string => typeof url === "string") : [];
      } catch {
        return [];
      }
    });
    deleteThreadAttachments(threadId);
    db.prepare("DELETE FROM notifications WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM replies WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM thread_likes WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM thread_favorites WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM threads WHERE id = ?").run(threadId);
    return urls;
  });
  await Promise.all(paths.map(removeUploadFile));
  revalidatePath("/", "layout");
  // 删除后回到原板块，而不是停留在一个即将 404 的帖子页
  redirect(`/b/${row.slug}`);
}

export async function togglePinAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const threadId = Number(formData.get("thread_id"));
  if (!threadId) return;
  db.prepare("UPDATE threads SET is_pinned = 1 - is_pinned WHERE id = ?").run(threadId);
  revalidatePath("/", "layout");
}

export async function toggleFeatureAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const threadId = Number(formData.get("thread_id"));
  if (!threadId) return;
  db.prepare("UPDATE threads SET is_featured = 1 - is_featured WHERE id = ?").run(threadId);
  revalidatePath("/", "layout");
}

/* ---------------- 站点设置 ---------------- */

export async function uploadBadgeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (admin.role !== "admin") return fail("仅管理员可修改站点徽章");
  const file = formData.get("badge");
  if (!(file instanceof File) || file.size === 0) return fail("请先选择一张图片");
  if (file.size > 2 * 1024 * 1024) return fail("图片不能超过 2MB");
  let url: string;
  try {
    url = await saveUploadImage(file, "badge");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "图片保存失败");
  }
  const old = getSetting("site_badge");
  setSetting("site_badge", url);
  await removeUploadFile(old);
  revalidatePath("/", "layout");
  return okMsg("站点徽章已更新，全站生效");
}

export async function removeBadgeAction(): Promise<void> {
  const admin = await requireAdmin();
  if (admin.role !== "admin") return;
  const old = getSetting("site_badge");
  if (old.startsWith("/uploads/")) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(old)));
    } catch {
      /* 文件不存在则忽略 */
    }
  }
  setSetting("site_badge", "");
  revalidatePath("/", "layout");
}

/* ---------------- 校友名单（人工审核参考） ---------------- */

export async function importWhitelistAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (admin.role !== "admin") return fail("仅管理员可操作");
  const raw = String(formData.get("roster") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return fail("请粘贴名单内容，每行一条：姓名,学号,年级(可选)");

  let added = 0;
  let skipped = 0;
  for (const line of lines) {
    const parts = line
      .split(/[,，\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      skipped++;
      continue;
    }
    const [name, sid, grade] = parts;
    if (!name || !sid || name.length > 20 || sid.length > 20) {
      skipped++;
      continue;
    }
    const info = db
      .prepare(
        "INSERT OR IGNORE INTO whitelist (real_name, student_id, grade, created_at) VALUES (?, ?, ?, datetime('now','localtime'))"
      )
      .run(name, sid, grade ?? "");
    if (Number(info.changes) > 0) added++;
    else skipped++;
  }
  revalidatePath("/", "layout");
  return okMsg(
    `导入完成：新增 ${added} 条${skipped ? `，跳过 ${skipped} 条（重复或格式错误）` : ""}`
  );
}

export async function deleteWhitelistAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (admin.role !== "admin") return;
  const id = Number(formData.get("whitelist_id"));
  if (!id) return;
  db.prepare("DELETE FROM whitelist WHERE id = ?").run(id);
  revalidatePath("/", "layout");
}

/** Only reviewed grade changes may change access to grade boards. */
export async function setUserGradeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("user_id"));
  const grade = String(formData.get("grade") ?? "");
  if (!Number.isSafeInteger(userId) || userId <= 0 || !["", ...GRADES].includes(grade)) return;
  db.prepare("UPDATE users SET grade = ? WHERE id = ?").run(grade, userId);
  revalidatePath("/", "layout");
}
