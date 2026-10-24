import data from "@emoji-mart/data";
const catalog = data as {
  emojis: Record<string, { name: string; keywords?: string[]; skins: Array<{ native?: string } | null> }>;
  aliases: Record<string, string>;
};
export const nativeEmojis = new Set(
  Object.values(catalog.emojis).flatMap((e) => e.skins.map((s) => s?.native)),
);

export type EmojiEntry = { native: string; code: string };

const skinSuffix = (index: number) => (index > 0 ? `::skin-tone-${index + 1}` : "");

/**
 * short code → 渲染条目。规范 id 与别名都可作为键；肤色变体带 `::skin-tone-N` 后缀。
 * 别名条目的 code 指向规范 id（`:thumbsup:` 的 code 是 `:+1:`），用于展示规范名。
 */
export const emojiByCode = (() => {
  const map = new Map<string, EmojiEntry>();
  for (const [id, emoji] of Object.entries(catalog.emojis))
    emoji.skins.forEach((skin, i) => {
      if (!skin?.native) return;
      const suffix = skinSuffix(i);
      map.set(`:${id}${suffix}:`, { native: skin.native, code: `:${id}${suffix}:` });
    });
  for (const [alias, id] of Object.entries(catalog.aliases)) {
    const emoji = catalog.emojis[id];
    if (!emoji) continue;
    emoji.skins.forEach((skin, i) => {
      if (!skin?.native) return;
      const suffix = skinSuffix(i);
      map.set(`:${alias}${suffix}:`, { native: skin.native, code: `:${id}${suffix}:` });
    });
  }
  return map;
})();

/**
 * unicode → 规范 short code（emoji-mart 的 canonical id，如 👍 → :+1: 而非 :thumbsup:）。
 * 极少数 unicode 对应多个规范 id 时按数据文件顺序取第一个，保证结果确定。
 */
export const codeOf = (() => {
  const reverse = new Map<string, string>();
  for (const [id, emoji] of Object.entries(catalog.emojis))
    emoji.skins.forEach((skin, i) => {
      if (!skin?.native || reverse.has(skin.native)) return;
      reverse.set(skin.native, `:${id}${skinSuffix(i)}:`);
    });
  return (native: string) => reverse.get(native) ?? "";
})();
