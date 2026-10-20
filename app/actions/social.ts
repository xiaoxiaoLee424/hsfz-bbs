"use server";

import { allowAction } from "@/lib/ratelimit";
import { getCurrentUser } from "@/lib/auth";
import * as social from "@/lib/social";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "./auth";
import { prepareAttachment, AttachmentError } from "@/lib/attachments";

function text(form: FormData, key: string) { return String(form.get(key) ?? ""); }
export async function startConversationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };
  let id: number;
  try { id = social.startConversation(user.id, text(form, "username").trim().replace(/^@/, "")); }
  catch (error) { if (error instanceof social.SocialError) return { ok: false, message: error.message }; throw error; }
  revalidatePath("/inbox");
  redirect(`/inbox/${id}`);
}
export async function sendMessageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };
  const id = Number(form.get("id")), kind = text(form, "kind");
  if (!Number.isSafeInteger(id) || id <= 0 || !["direct", "group"].includes(kind)) return { ok: false, message: "会话不存在" };
  try {
    // Check access before processing a potentially large upload; sending checks it again after the await.
    if (kind === "direct") social.assertDirectSendAccess(user.id, id);
    else social.assertGroupSendAccess(user.id, id);
    const content = text(form, "content");
    if (content.trim()) social.messageContent(content);
    if (kind === "direct") {
      const rate = allowAction(`dm:${user.id}`, 15_000);
      if (!rate.ok) return { ok: false, message: `私信发送过于频繁，请 ${rate.retryAfterSec} 秒后再试` };
    }
    const attachment = await prepareAttachment(form);
    if (kind === "direct") social.sendDirectMessage(user.id, id, text(form, "content"), attachment);
    else social.sendGroupMessage(user.id, id, text(form, "content"), attachment);
  } catch (error) { if (error instanceof social.SocialError || error instanceof AttachmentError) return { ok: false, message: error.message }; throw error; }
  revalidatePath(kind === "direct" ? "/inbox" : "/groups", "layout");
  revalidatePath("/", "layout");
  return { ok: true, message: "已发送" };
}
export async function createGroupAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录" };
  let id: number;
  try { id = social.createGroup(user.id, text(form, "name"), text(form, "description")); }
  catch (error) { if (error instanceof social.SocialError) return { ok: false, message: error.message }; throw error; }
  revalidatePath("/groups");
  redirect(`/groups/${id}`);
}
export async function membershipAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请先登录后加入小组" };
  const id = Number(form.get("id"));
  try {
    if (text(form, "operation") === "leave") social.leaveGroup(user.id, id);
    else social.joinGroup(user.id, id);
  } catch (error) { if (error instanceof social.SocialError) return { ok: false, message: error.message }; throw error; }
  revalidatePath("/groups", "layout");
  return { ok: true, message: text(form, "operation") === "leave" ? "已退出小组" : "已加入小组" };
}
export async function markChatReadAction(kind: "direct" | "group", id: number, lastId: number) {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    if (kind === "direct") social.markDirectRead(user.id, id, lastId);
    else if (kind === "group") social.markGroupRead(user.id, id, lastId);
  } catch (error) { if (!(error instanceof social.SocialError)) throw error; }
  revalidatePath("/", "layout");
}
