/* eslint-disable @next/next/no-img-element -- Markdown 渲染用户上传的图片，保持原生尺寸与懒加载 */
import { PostQuote } from "./PostQuote";
import { InternalCard } from "./ContentExtras";
import { internalTarget } from "@/lib/forum-syntax";
import { forumSyntax } from "@/lib/forum-syntax";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import { mentionPlugin } from "@/lib/markdown-mentions";

/** 上传占位令牌不是可导航协议，会被默认消毒洗成空 src（触发浏览器整页重下载告警）；
 * 这里对 upload-pending: 网关放行，其余 URL 仍走 react-markdown 的默认消毒。 */
function urlTransform(url: string) {
  return /^upload-pending:[\w-]+$/.test(url) ? url : defaultUrlTransform(url);
}

/** Shared rendering keeps the editor preview and posted Markdown consistent. */
export function RichText({
  content,
  className = "",
  usernames = [],
  emojis = [],
}: {
  content: string;
  className?: string;
  usernames?: readonly string[];
  emojis?: readonly { name: string; image_path: string }[];
}) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        components={{
          img: (props) => {
            // node 是 react-markdown 注入的 hast 节点，不能透传给 DOM
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { node, ...rest } = props;
            const src = typeof rest.src === "string" ? rest.src : undefined;
            const alt = typeof rest.alt === "string" ? rest.alt : "";
            // 上传中的占位令牌渲染成状态条，而不是一个必然 404 的 <img>
            if (src?.startsWith("upload-pending:"))
              return (
                <span className="upload-pending" role="status">
                  ⏳ {alt || "图片上传中"}…
                </span>
              );
            return <img {...rest} src={src} alt={alt} />;
          },
          blockquote: ({ node, children }) =>
            node?.properties["data-quote-thread"] ? (
              <PostQuote
                thread={Number(node.properties["data-quote-thread"])}
                reply={Number(node.properties["data-quote-reply"])}
              >
                {children}
              </PostQuote>
            ) : (
              <blockquote className="plain-quote">{children}</blockquote>
            ),
          a: ({ href, children, ...props }) => {
            const target = href ? internalTarget(href) : null;
            return target && String(children) === href ? (
              <InternalCard {...target} />
            ) : (
              <a href={href} {...props}>
                {children}
              </a>
            );
          },
        }}
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          forumSyntax(emojis),
          remarkBreaks,
          mentionPlugin(usernames),
        ]}
        urlTransform={urlTransform}
        rehypePlugins={[[rehypeKatex, { trust: false, throwOnError: false }]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
