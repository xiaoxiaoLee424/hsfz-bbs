"use server";

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db, GRADES, UPLOAD_DIR } from "@/lib/db";
import { getCurrentUser, requireUser, destroyUserSessions } from "@/lib/auth";
import { nowStr } from "@/lib/format";
import type { ActionState } from "./auth";

const fail = (message: string): ActionState => ({ message, ok: false });
const okMsg = (message: string): ActionState => ({ message, ok: true });

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const bindPassword = String(formData.get("bind_password") ?? "");
  if (!nickname || nickname.length > 12) return fail("昵称不能为空，且不超过 12 个字");
  if (bio.length > 100) return fail("个性签名不能超过 100 字");
  if (![...GRADES, ""].includes(grade)) return fail("年级不正确");
  if (phone) {
    if (!/^1[3-9]\d{9}$/.test(phone)) return fail("手机号格式不正确");
    const current = db.prepare("SELECT phone FROM users WHERE id = ?").get(user.id) as {
      phone: string;
    };
    if (phone !== current.phone) {
      // 更换绑定手机号需验证登录密码，防止账号被冒用后改绑
      const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as {
        password_hash: string;
      };
      if (!bindPassword || !bcrypt.compareSync(bindPassword, row.password_hash))
        return fail("更换绑定手机号需输入当前登录密码确认");
    }
  }
  db.prepare("UPDATE users SET nickname = ?, bio = ?, grade = ?, phone = ? WHERE id = ?").run(
    nickname,
    bio,
    grade,
    phone,
    user.id
  );
  revalidatePath("/", "layout");
  return okMsg("资料已更新");
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadAvatarAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return fail("请先选择一张图片");
  if (file.size > 2 * 1024 * 1024) return fail("图片不能超过 2MB");
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return fail("仅支持 JPG / PNG / WEBP / GIF 格式");

  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(/* turbopackIgnore: true */ UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));

  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(`/uploads/${name}`, user.id);
  revalidatePath("/", "layout");
  return okMsg("头像已更新");
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const oldPassword = String(formData.get("old_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const newPassword2 = String(formData.get("new_password2") ?? "");
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as {
    password_hash: string;
  };
  if (!bcrypt.compareSync(oldPassword, row.password_hash)) return fail("当前密码不正确");
  if (newPassword.length < 6) return fail("新密码至少 6 位");
  if (newPassword !== newPassword2) return fail("两次输入的新密码不一致");
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(newPassword, 10),
    user.id
  );
  // 改密后销毁该账号全部会话，所有设备强制重新登录
  destroyUserSessions(user.id);
  redirect("/login?pwd=1");
}

export async function removeAvatarAction(): Promise<void> {
  const user = await requireUser();
  const row = db.prepare("SELECT avatar FROM users WHERE id = ?").get(user.id) as { avatar: string };
  if (row.avatar?.startsWith("/uploads/")) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(row.avatar)));
    } catch {
      /* 文件不存在则忽略 */
    }
  }
  db.prepare("UPDATE users SET avatar = '' WHERE id = ?").run(user.id);
  revalidatePath("/", "layout");
}

/* ---------------- 工单 ---------------- */

export async function createTicketAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const category = String(formData.get("category") ?? "other");
  const subject = String(formData.get("subject") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!["title_request", "suggestion", "report", "other"].includes(category))
    return fail("请选择正确的分类");
  if (subject.length < 2 || subject.length > 60) return fail("主题长度需在 2-60 字之间");
  if (content.length < 5) return fail("内容太短啦，至少 5 个字，方便管理员了解情况");

  const at = nowStr();
  const info = db
    .prepare(
      `INSERT INTO tickets (user_id, category, subject, status, user_read_at, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?, ?)`
    )
    .run(user.id, category, subject, at, at, at);
  const tid = Number(info.lastInsertRowid);
  db.prepare(
    "INSERT INTO ticket_messages (ticket_id, sender_id, is_admin, content, created_at) VALUES (?, ?, 0, ?, ?)"
  ).run(tid, user.id, content, at);
  revalidatePath("/", "layout");
  redirect(`/messages/${tid}`);
}

export async function replyTicketAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const ticketId = Number(formData.get("ticket_id"));
  const content = String(formData.get("content") ?? "").trim();
  if (!ticketId || !content) return;
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ? AND user_id = ?").get(ticketId, user.id) as
    | { id: number; status: string }
    | undefined;
  if (!ticket || ticket.status === "closed") return;
  const at = nowStr();
  db.prepare(
    "INSERT INTO ticket_messages (ticket_id, sender_id, is_admin, content, created_at) VALUES (?, ?, 0, ?, ?)"
  ).run(ticketId, user.id, content, at);
  db.prepare("UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?").run(at, ticketId);
  revalidatePath(`/messages/${ticketId}`);
  revalidatePath("/admin");
}

export async function adminReplyTicketAction(formData: FormData): Promise<void> {
  const admin = await requireUser();
  if (admin.role !== "admin") return;
  const ticketId = Number(formData.get("ticket_id"));
  const content = String(formData.get("content") ?? "").trim();
  if (!ticketId || !content) return;
  const at = nowStr();
  db.prepare(
    "INSERT INTO ticket_messages (ticket_id, sender_id, is_admin, content, created_at) VALUES (?, ?, 1, ?, ?)"
  ).run(ticketId, admin.id, content, at);
  db.prepare("UPDATE tickets SET status = 'replied', updated_at = ? WHERE id = ?").run(at, ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath("/admin");
  revalidatePath("/messages");
}

export async function closeTicketAction(formData: FormData): Promise<void> {
  const admin = await requireUser();
  if (admin.role !== "admin") return;
  const ticketId = Number(formData.get("ticket_id"));
  if (!ticketId) return;
  db.prepare("UPDATE tickets SET status = 'closed', updated_at = ? WHERE id = ?").run(nowStr(), ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  revalidatePath("/admin");
  revalidatePath("/messages");
}

export async function grantTitleAction(formData: FormData): Promise<void> {
  const admin = await requireUser();
  if (admin.role !== "admin") return;
  const ticketId = Number(formData.get("ticket_id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!ticketId || !title || title.length > 16) return;
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | { user_id: number }
    | undefined;
  if (!ticket) return;
  db.prepare("UPDATE users SET custom_title = ? WHERE id = ?").run(title, ticket.user_id);
  db.prepare(
    "INSERT INTO ticket_messages (ticket_id, sender_id, is_admin, content, created_at) VALUES (?, ?, 1, ?, ?)"
  ).run(ticketId, admin.id, `管理员已为你授予专属头衔「${title}」，快去个人主页看看吧！`, nowStr());
  db.prepare("UPDATE tickets SET status = 'replied', updated_at = ? WHERE id = ?").run(nowStr(), ticketId);
  revalidatePath("/", "layout");
}
