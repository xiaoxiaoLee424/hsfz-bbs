/** 纯数据与校验，客户端组件也可以安全引用（不碰数据库）。 */

export const BANNER_PRESETS = [
  { key: "ocean", name: "深海蓝", css: "linear-gradient(120deg, #0b3d91 0%, #1e88e5 100%)" },
  { key: "teal", name: "青绿", css: "linear-gradient(120deg, #0f766e 0%, #14b8a6 100%)" },
  { key: "violet", name: "星云紫", css: "linear-gradient(120deg, #4c1d95 0%, #7c3aed 100%)" },
  { key: "sunset", name: "落日橙", css: "linear-gradient(120deg, #9a3412 0%, #f59e0b 100%)" },
  { key: "rose", name: "莓果红", css: "linear-gradient(120deg, #9d174d 0%, #f43f5e 100%)" },
  { key: "forest", name: "森林绿", css: "linear-gradient(120deg, #14532d 0%, #22c55e 100%)" },
  { key: "night", name: "夜幕", css: "linear-gradient(120deg, #1e293b 0%, #64748b 100%)" },
  { key: "sky", name: "天青", css: "linear-gradient(120deg, #0369a1 0%, #38bdf8 100%)" },
] as const;

export type BannerPresetKey = (typeof BANNER_PRESETS)[number]["key"];

export const BANNER_STATUS_LABEL: Record<string, string> = {
  pending: "待审核",
  approved: "已投放",
  rejected: "未通过",
  offline: "已下线",
};

const IMAGE_PATH = /^\/uploads\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|gif)$/;

export function isPresetKey(value: string): value is BannerPresetKey {
  return BANNER_PRESETS.some((p) => p.key === value);
}

export function isValidBannerImage(value: string): boolean {
  return IMAGE_PATH.test(value);
}

export function presetCss(key: string): string {
  return (BANNER_PRESETS.find((p) => p.key === key) ?? BANNER_PRESETS[0]).css;
}

/** 校验投稿链接：留空 / 站内路径 / http(s) 绝对地址。 */
export function normalizeBannerLink(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim();
  if (!value) return { ok: true, value: "" };
  if (value.length > 300) return { ok: false, message: "链接太长了（最多 300 字）" };
  if (value.startsWith("/") && !value.startsWith("//")) return { ok: true, value };
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return { ok: false, message: "链接只支持 http / https" };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, message: "链接格式不正确：可以填 /t/123 这样的站内地址，或 https:// 开头的网址" };
  }
}

/** 把一条横幅解析成背景样式（图片会叠一层深色遮罩，保证文字可读）。 */
export function bannerVisual(bgKind: string, bgValue: string) {
  if (bgKind === "image" && isValidBannerImage(bgValue)) {
    return {
      isImage: true as const,
      style: {
        backgroundImage: `linear-gradient(100deg, rgba(3,10,24,.74) 0%, rgba(3,10,24,.46) 55%, rgba(3,10,24,.32) 100%), url(${bgValue})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      },
    };
  }
  return { isImage: false as const, style: { backgroundImage: presetCss(bgValue) } };
}
