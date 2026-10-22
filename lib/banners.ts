import { db } from "./db";

export {
  BANNER_PRESETS,
  BANNER_STATUS_LABEL,
  isPresetKey,
  isValidBannerImage,
  normalizeBannerLink,
  presetCss,
  bannerVisual,
} from "./banner-presets";
export type { BannerPresetKey } from "./banner-presets";

export type BannerRow = {
  id: number;
  user_id: number;
  title: string;
  text: string;
  link: string;
  bg_kind: string;
  bg_value: string;
  status: string;
  reject_reason: string;
  sort: number;
  created_at: string;
  updated_at: string;
  user_nickname?: string;
  user_username?: string;
};

export function activeBanners(): BannerRow[] {
  return db
    .prepare(
      `SELECT b.*, u.nickname AS user_nickname, u.username AS user_username
       FROM banners b JOIN users u ON u.id = b.user_id
       WHERE b.status = 'approved' AND u.status = 'approved' AND u.banned = 0
       ORDER BY b.sort DESC, b.id DESC`
    )
    .all() as BannerRow[];
}

export function pendingBanners(): BannerRow[] {
  return db
    .prepare(
      `SELECT b.*, u.nickname AS user_nickname, u.username AS user_username
       FROM banners b JOIN users u ON u.id = b.user_id
       WHERE b.status = 'pending' ORDER BY b.id ASC`
    )
    .all() as BannerRow[];
}

export function allBannersForAdmin(limit = 100): BannerRow[] {
  return db
    .prepare(
      `SELECT b.*, u.nickname AS user_nickname, u.username AS user_username
       FROM banners b JOIN users u ON u.id = b.user_id
       ORDER BY CASE b.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                b.sort DESC, b.id DESC LIMIT ?`
    )
    .all(limit) as BannerRow[];
}

export function userBanners(userId: number, limit = 20): BannerRow[] {
  return db
    .prepare("SELECT * FROM banners WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as BannerRow[];
}

export function bannerById(id: number): BannerRow | undefined {
  return db.prepare("SELECT * FROM banners WHERE id = ?").get(id) as BannerRow | undefined;
}

export function countPendingBanners(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM banners WHERE status = 'pending'").get() as { c: number }).c;
}
