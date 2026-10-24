export type EmojiCodeItem = {
  code: string;
  kind: "standard" | "custom";
  native?: string;
  image?: string;
};

/** 候选排序：精确相等 > 前缀 > 中间包含；同组内自定义优先、短 code 优先、再按字母序。
 * 纯函数，供补全下拉与单测共用。返回按序排列的匹配项（调用方自行截断数量）。 */
export function rankEmojiCodes(items: EmojiCodeItem[], query: string): EmojiCodeItem[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const tier = (code: string) =>
    code === q ? 0 : code.startsWith(q) ? 1 : code.includes(q) ? 2 : -1;
  return items
    .map((item) => ({ item, rank: tier(item.code.toLowerCase()) }))
    .filter((entry) => entry.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (b.item.kind === "custom" ? 1 : 0) - (a.item.kind === "custom" ? 1 : 0) ||
        a.item.code.length - b.item.code.length ||
        a.item.code.localeCompare(b.item.code),
    )
    .map((entry) => entry.item);
}
