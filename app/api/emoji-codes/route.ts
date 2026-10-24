import data from "@emoji-mart/data";
import { emojis } from "@/lib/forum-features";

/** 全量 short code 清单：标准表情（规范 id + 别名）与自定义表情。
 * 客户端补全一次拉取后本地即时过滤，不再逐键请求。 */
export async function GET() {
  const catalog = data as {
    emojis: Record<string, { skins: Array<{ native?: string } | null> }>;
    aliases: Record<string, string>;
  };
  type Item = { code: string; kind: "standard" | "custom"; native?: string; image?: string };
  const byCode = new Map<string, Item>();
  for (const [id, emoji] of Object.entries(catalog.emojis)) {
    const native = emoji.skins[0]?.native;
    if (native) byCode.set(id, { code: id, kind: "standard", native });
  }
  for (const [alias, id] of Object.entries(catalog.aliases)) {
    const emoji = catalog.emojis[id];
    const native = emoji?.skins[0]?.native;
    if (native) byCode.set(alias, { code: alias, kind: "standard", native });
  }
  for (const emoji of emojis()) {
    if (emoji.active)
      byCode.set(emoji.name, { code: emoji.name, kind: "custom", image: emoji.image_path });
  }
  return Response.json([...byCode.values()], {
    headers: { "Cache-Control": "no-store" },
  });
}
