"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { nowStr } from "@/lib/format";
import { findSensitiveWord } from "@/lib/moderation";
import { allowAction } from "@/lib/ratelimit";
import { saveUploadImage, removeUploadFile, isAllowedImageType } from "@/lib/upload";
import { BANNER_PRESETS, isPresetKey, normalizeBannerLink } from "@/lib/banner-presets";
import type { ActionState } from "./auth";

const fail = (message: string): ActionState => ({ message, ok: false });

const MAX_ACTIVE = 3; // 每人最多 3 条「待审核 + 已投放」

/** 用户投稿：默认进入待审核，管理员通过后才会上首页。 */
export async function submitBannerAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return fail("请先登录后再投稿");

  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const linkInput = String(formData.get("link") ?? "");
  const presetInput = String(formData.get("preset") ?? "");

  if (title.length < 2 || title.length > 24) return fail("标题需要 2-24 个字");
  if (text.length > 60) return fail("副标题最多 60 个字");
  const link = normalizeBannerLink(linkInput);
  if (!link.ok) return fail(link.message);
  const sensitive = findSensitiveWord(`${title}\n${text}`);
  if (sensitive) return fail(`内容包含敏感词「${sensitive}」，请修改后再投`);

  const preset = isPresetKey(presetInput) ? presetInput : BANNER_PRESETS[0].key;

  const rate = allowAction(`banner:${user.id}`, 120_000);
  if (!rate.ok) return fail(`投稿太频繁啦，请 ${rate.retryAfterSec} 秒后再试`);
  const active = (
    db
      .prepare("SELECT COUNT(*) AS c FROM banners WHERE user_id = ? AND status IN ('pending','approved')")
      .get(user.id) as { c: number }
  ).c;
  if (active >= MAX_ACTIVE)
    return fail(`你已经有 ${MAX_ACTIVE} 条横幅在审核或投放中，等管理员处理后再投吧`);

  // 自定义背景图（可选）
  let bgKind = "preset";
  let bgValue: string = preset;
  const file = formData.get("bg_image");
  if (file instanceof File && file.size > 0) {
    if (!isAllowedImageType(file)) return fail("背景图仅支持 JPG / PNG / WEBP / GIF");
    try {
      bgValue = await saveUploadImage(file, "banner");
      bgKind = "image";
    } catch (error) {
      return fail(error instanceof Error ? error.message : "背景图保存失败，请重试");
    }
  }

  try {
    db.prepare(
      `INSERT INTO banners (user_id, title, text, link, bg_kind, bg_value, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(user.id, title, text, link.value, bgKind, bgValue, nowStr(), nowStr());
  } catch {
    if (bgKind === "image") await removeUploadFile(bgValue);
    return fail("投稿保存失败，请稍后重试");
  }

  revalidatePath("/banner");
  revalidatePath("/", "layout");
  return { message: "投稿成功，管理员审核通过后就会出现在首页", ok: true };
}

/** 作者撤回：只能删掉自己还没投放（待审核 / 未通过 / 已下线）的横幅。 */
export async function deleteMyBannerAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = Number(formData.get("banner_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const row = db.prepare("SELECT * FROM banners WHERE id = ? AND user_id = ?").get(id, user.id) as
    | { id: number; status: string; bg_kind: string; bg_value: string }
    | undefined;
  if (!row || row.status === "approved") return;
  db.prepare("DELETE FROM banners WHERE id = ? AND user_id = ?").run(id, user.id);
  if (row.bg_kind === "image") await removeUploadFile(row.bg_value);
  revalidatePath("/banner");
  revalidatePath("/", "layout");
}

/* ---------------- 管理员 ---------------- */

export async function approveBannerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("banner_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const max =
    (db.prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM banners WHERE status = 'approved'").get() as { m: number }).m;
  db.prepare("UPDATE banners SET status = 'approved', reject_reason = '', sort = ?, updated_at = ? WHERE id = ?")
    .run(max + 1, nowStr(), id);
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

export async function rejectBannerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("banner_id"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 100);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  db.prepare("UPDATE banners SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ?")
    .run(reason, nowStr(), id);
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

export async function takeDownBannerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("banner_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  db.prepare("UPDATE banners SET status = 'offline', updated_at = ? WHERE id = ?").run(nowStr(), id);
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

export async function deleteBannerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("banner_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const row = db.prepare("SELECT bg_kind, bg_value FROM banners WHERE id = ?").get(id) as
    | { bg_kind: string; bg_value: string }
    | undefined;
  db.prepare("DELETE FROM banners WHERE id = ?").run(id);
  if (row?.bg_kind === "image") await removeUploadFile(row.bg_value);
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

/** 调整投放顺序：dir = up 前移，down 后移。统一重排 sort，避免并列。 */
export async function moveBannerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("banner_id"));
  const dir = String(formData.get("dir") ?? "");
  if (!Number.isSafeInteger(id) || id <= 0 || !["up", "down"].includes(dir)) return;
  db.transaction(() => {
    const rows = db
      .prepare("SELECT id FROM banners WHERE status = 'approved' ORDER BY sort DESC, id DESC")
      .all() as { id: number }[];
    const index = rows.findIndex((r) => r.id === id);
    const target = dir === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    const update = db.prepare("UPDATE banners SET sort = ? WHERE id = ?");
    rows.forEach((row, i) => update.run(rows.length - i, row.id));
  }).immediate();
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}
