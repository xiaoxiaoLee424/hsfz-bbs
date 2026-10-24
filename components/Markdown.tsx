import {emojis} from "@/lib/forum-features";
import { db } from "@/lib/db";
import { markdownMentionNames } from "@/lib/markdown-mentions";
import { RichText } from "./RichText";

/**
 * 渲染帖文/回复正文：Markdown（GFM）+ LaTeX 公式（$…$ / $$…$$）+ 换行即换行 + @提及。
 * @用户名 仅在账号真实存在时转为个人主页链接；前置不能是字母数字，避免误伤邮箱。
 * 原始 HTML 默认被转义，天然防 XSS。
 */
export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  const candidates = markdownMentionNames(content, 100);
  const users = candidates.length ? db.prepare(
    `SELECT username FROM users WHERE username IN (${candidates.map(() => "?").join(",")})`
  ).all(...candidates) as { username: string }[] : [];
  return <RichText emojis={emojis()} content={content} className={className} usernames={users.map((user) => user.username)} />;
}
