import { db } from "@/lib/db";
import { RichText } from "./RichText";

/**
 * 渲染帖文/回复正文：Markdown（GFM）+ LaTeX 公式（$…$ / $$…$$）+ 换行即换行 + @提及。
 * @用户名 仅在账号真实存在时转为个人主页链接；前置不能是字母数字，避免误伤邮箱。
 * 原始 HTML 默认被转义，天然防 XSS。
 */
export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  const candidates = [...new Set(Array.from(content.matchAll(/@([a-z0-9_]{3,20})\b/g), m => m[1]))];
  const usernames = candidates.filter(username => db.prepare("SELECT 1 FROM users WHERE username = ?").get(username));
  return <RichText content={content} className={className} usernames={usernames} />;
}
