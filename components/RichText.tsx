import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import type { Root, RootContent, Text } from "mdast";

// Only prose nodes become mentions. Code, math, links and email addresses stay intact.
function mentionPlugin(usernames: string[]) {
  const known = new Set(usernames);
  return () => (tree: Root) => {
    function walk(parent: Root | { children: RootContent[] }) {
      const result: RootContent[] = [];
      for (const node of parent.children) {
        if (node.type === "text") {
          const text = (node as Text).value;
          let cursor = 0;
          for (const match of text.matchAll(/(^|[^a-zA-Z0-9_@])@([a-z0-9_]{3,20})\b/g)) {
            if (!known.has(match[2])) continue;
            const start = match.index! + match[1].length;
            if (start > cursor) result.push({ type: "text", value: text.slice(cursor, start) });
            result.push({ type: "link", url: `/u/${match[2]}`, children: [{ type: "text", value: `@${match[2]}` }] });
            cursor = start + match[2].length + 1;
          }
          result.push({ type: "text", value: text.slice(cursor) });
        } else {
          if ("children" in node && !["link", "linkReference"].includes(node.type)) walk(node as { children: RootContent[] });
          result.push(node);
        }
      }
      parent.children = result;
    }
    walk(tree);
  };
}

export function RichText({ content, className = "", usernames = [] }: { content: string; className?: string; usernames?: string[] }) {
  return <div className={`markdown-body ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks, mentionPlugin(usernames)]}
      rehypePlugins={[[rehypeKatex, { trust: false, throwOnError: false }]]}
      components={{
        h1: ({ children }) => <h2>{children}</h2>,
        a: ({ href, children }) => {
          if (!href || !/^https?:\/\//i.test(href)) return <a href={href}>{children}</a>;
          let url: URL;
          try { url = new URL(href); } catch { return <>{children}</>; }
          return <a href={href} className="link-card" target="_blank" rel="noopener noreferrer nofollow ugc">
            <span className="link-card-symbol" aria-hidden="true">↗</span>
            <span className="link-card-copy"><span className="link-card-domain">{url.hostname}</span>
              <span className="link-card-title">{children}</span>
              <span className="link-card-path">{url.pathname === "/" ? "访问网站" : url.pathname}{url.search}</span>
            </span><span className="link-card-arrow" aria-hidden="true">↗</span>
          </a>;
        },
      }}>{content}</ReactMarkdown>
  </div>;
}
