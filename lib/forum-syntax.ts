import { emojiByCode } from "./emoji-catalog";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Root } from "mdast";
type Node = {
  type: string;
  value?: string;
  url?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: {
    hName: string;
    hProperties?: Record<string, string>;
    reference?: { thread: number; reply: number };
  };
};
const excluded = new Set([
  "code",
  "inlineCode",
  "math",
  "inlineMath",
  "html",
  "link",
  "image",
  "linkReference",
  "imageReference",
]);
export function internalTarget(url: string) {
  const m =
    /^(?:https:\/\/bbs\.hsfz-bbs\.cn)?\/t\/(\d+)(?:#reply-(\d+))?$/.exec(url);
  return m ? { thread: Number(m[1]), reply: Number(m[2] || 0) } : null;
}

const EMOJI_CLUSTER =
  /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*/gu;

/** 一行是否仅由 ≤3 个 emoji（含手打 Unicode、shortcode 渲染节点、自定义表情）与空白构成。 */
function isEmojiOnlyLine(nodes: Node[]) {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "text") {
      const value = node.value ?? "";
      const clusters = value.match(EMOJI_CLUSTER) ?? [];
      if (value.replace(EMOJI_CLUSTER, "").trim() !== "") return false;
      count += clusters.length;
      continue;
    }
    const className = String(node.data?.hProperties?.className ?? "");
    if (node.data?.hName === "span" && className.includes("native-emoji")) {
      count++;
      continue;
    }
    if (node.type === "image" && className.includes("custom-emoji")) {
      count++;
      continue;
    }
    return false;
  }
  return count >= 1 && count <= 3;
}
export function forumSyntax(
  registry: readonly { name: string; image_path: string }[],
) {
  return () => (root: Root, file: { value: unknown }) => {
    const raw = String(file.value || "");
    const escaped = (node: Node) =>
      !!node.position &&
      /\\[\[:]/.test(
        raw.slice(node.position?.start.offset, node.position?.end.offset),
      );
    const emoji = new Map(registry.map((e) => [e.name, e.image_path]));
    function walk(parent: Node, depth = 0) {
      if (!parent.children || excluded.has(parent.type) || depth > 20) return;
      if (
        parent.type === "paragraph" &&
        parent.children.length === 1 &&
        parent.children[0].type === "text"
      ) {
        const text = parent.children[0].value!;
        if (internalTarget(text) && !escaped(parent.children[0])) {
          parent.children = [
            {
              type: "link",
              url: text,
              children: [{ type: "text", value: text }],
            },
          ];
          return;
        }
      }
      // Block envelopes are recognized only as entire paragraphs, never inside code or URLs.
      const children: Node[] = [];
      for (const child of parent.children) {
        if (child.type !== "paragraph" || !child.children || escaped(child)) {
          children.push(child);
          continue;
        }
        const lines: Node[][] = [[]];
        for (const n of child.children) {
          if (n.type !== "text") {
            lines.at(-1)!.push(n);
            continue;
          }
          const parts = n.value!.split(/\r?\n/);
          parts.forEach((part, i) => {
            if (i) lines.push([]);
            if (part) lines.at(-1)!.push({ type: "text", value: part });
          });
        }
        const isBoundary = (line: Node[]) =>
          line.length === 1 &&
          line[0].type === "text" &&
          /^\[(?:quote(?: thread=\d+ reply=\d+)?|details(?:="[^"\n]{0,100}")?|\/(?:quote|details))\]$/.test(
            line[0].value!,
          );
        if (!lines.some(isBoundary)) {
          children.push(child);
          continue;
        }
        let pending: Node[] = [];
        const flush = () => {
          if (pending.length) {
            children.push({ type: "paragraph", children: pending });
            pending = [];
          }
        };
        for (const line of lines) {
          if (isBoundary(line)) {
            flush();
            children.push({ type: "paragraph", children: line });
          } else {
            if (pending.length) pending.push({ type: "text", value: "\n" });
            pending.push(...line);
          }
        }
        flush();
      }
      for (let i = 0; i < children.length; i++) {
        const n = children[i];
        const first =
          n.type === "paragraph" && n.children?.[0]?.type === "text"
            ? n.children[0].value
            : "";
        const opener =
          /^\[(quote)(?: thread=(\d+) reply=(\d+))?\]$|^\[details(?:="([^"\n]{0,100})")?\]$/.exec(
            first || "",
          );
        if (opener && n.children?.length === 1 && !escaped(n)) {
          const tag = opener[1] || "details";
          let nesting = 1,
            j = i + 1;
          for (; j < children.length; j++) {
            const text =
              children[j].type === "paragraph" &&
              children[j].children?.length === 1
                ? children[j].children![0].value
                : "";
            if (text?.startsWith("[" + tag) && !text.startsWith("[/"))
              nesting++;
            if (text === "[/" + tag + "]" && --nesting === 0) break;
          }
          if (j < children.length) {
            const inner = children.slice(i + 1, j);
            if (tag === "details")
              inner.unshift({
                type: "paragraph",
                data: { hName: "summary" },
                children: [{ type: "text", value: opener[4] || "展开" }],
              });
            children.splice(i, j - i + 1, {
              type: "blockquote",
              data: {
                hName: tag === "details" ? "details" : "blockquote",
                hProperties: opener[2]
                  ? {
                      "data-quote-thread": opener[2],
                      "data-quote-reply": opener[3],
                    }
                  : {},
                reference: opener[2]
                  ? { thread: Number(opener[2]), reply: Number(opener[3]) }
                  : undefined,
              },
              children: inner,
            });
          }
        }
      }
      const out: Node[] = [];
      const stack: { tag: string; node: Node; parent: Node[] }[] = [];
      const target = () =>
        stack.length ? stack[stack.length - 1].node.children! : out;
      const tags: Record<string, string> = {
        b: "strong",
        i: "em",
        u: "u",
        s: "del",
        spoiler: "span",
      };
      for (const node of children) {
        if (node.type !== "text" || escaped(node)) {
          walk(node, depth + 1);
          target().push(node);
          continue;
        }
        const value = node.value!;
        let cursor = 0,
          plain = 0;
        while (cursor < value.length) {
          if (value[cursor] === "[") {
            const end = value.indexOf("]", cursor + 1);
            if (end !== -1 && end - cursor <= 10) {
              const token = value.slice(cursor + 1, end),
                closing = token.startsWith("/"),
                tag = closing ? token.slice(1) : token;
              if (
                tags[tag] &&
                ((!closing && stack.length < 20) ||
                  (closing && stack.at(-1)?.tag === tag))
              ) {
                if (cursor > plain)
                  target().push({
                    type: "text",
                    value: value.slice(plain, cursor),
                  });
                if (closing) {
                  const frame = stack.pop()!;
                  // 插入器在块标签内外垫的换行不是内容，剥掉以免 remark-breaks
                  // 把它们转成首尾的 <br>（剧透上下各多一行）
                  if (frame.tag === "spoiler") {
                    const kids = frame.node.children!;
                    if (kids[0]?.type === "text") {
                      const trimmed = kids[0].value!.replace(/^\r?\n/, "");
                      if (trimmed) kids[0].value = trimmed;
                      else kids.shift();
                    }
                    if (kids.at(-1)?.type === "text") {
                      const last = kids.at(-1)!;
                      const trimmed = last.value!.replace(/\r?\n$/, "");
                      if (trimmed) last.value = trimmed;
                      else kids.pop();
                    }
                  }
                }
                else {
                  const list = target();
                  const wrapper: Node = {
                    type: "emphasis",
                    data: {
                      hName: tags[tag],
                      hProperties:
                        tag === "spoiler"
                          ? { className: "spoiler", tabIndex: "0" }
                          : {},
                    },
                    children: [],
                  };
                  list.push(wrapper);
                  stack.push({ tag, node: wrapper, parent: list });
                }
                cursor = end + 1;
                plain = cursor;
                continue;
              }
            }
          }
          if (value[cursor] === ":") {
            // 自定义表情按裸名匹配；标准表情用完整 token（可带 ::skin-tone-N 肤色后缀）
            const m =
              /^:([a-z0-9_+-]{1,64})(?:::skin-tone-([2-6]))?:/.exec(
                value.slice(cursor),
              );
            const src = m && emoji.get(m[1]);
            const standard = m && !src ? emojiByCode.get(m[0]) : undefined;
            if (src && m) {
              if (cursor > plain)
                target().push({
                  type: "text",
                  value: value.slice(plain, cursor),
                });
              target().push({
                type: "image",
                url: src,
                ...{ alt: ":" + m[1] + ":" },
                data: {
                  hName: "img",
                  hProperties: {
                    className: "custom-emoji",
                    title: ":" + m[1] + ":",
                    "data-emoji-code": ":" + m[1] + ":",
                  },
                },
              } as Node);
              cursor += m[0].length;
              plain = cursor;
              continue;
            }
            if (standard && m) {
              if (cursor > plain)
                target().push({
                  type: "text",
                  value: value.slice(plain, cursor),
                });
              // 独立 span 而非裸 Unicode 文本：保留规范 short code 元数据，悬停与引用回填都要用
              target().push({
                type: "emphasis",
                data: {
                  hName: "span",
                  hProperties: {
                    className: "native-emoji",
                    title: standard.code,
                    "data-emoji-code": standard.code,
                  },
                },
                children: [{ type: "text", value: standard.native }],
              } as Node);
              cursor += m[0].length;
              plain = cursor;
              continue;
            }
          }
          cursor++;
        }
        if (plain < value.length)
          target().push({ type: "text", value: value.slice(plain) });
      }
      // Incomplete tags remain literal, while valid inner content is preserved.
      for (const frame of stack.reverse()) {
        const index = frame.parent.indexOf(frame.node);
        frame.parent.splice(
          index,
          1,
          { type: "text", value: "[" + frame.tag + "]" },
          ...frame.node.children!,
        );
      }
      // Discourse 的 only-emoji 规则：整行仅由 ≤3 个 emoji（手打 Unicode、shortcode、
      // 自定义表情）与空白构成时整段放大渲染
      if (parent.type === "paragraph" && isEmojiOnlyLine(out))
        parent.data = {
          ...parent.data,
          hName: "p",
          hProperties: { ...parent.data?.hProperties, className: "emoji-only" },
        };
      parent.children = out;
    }
    walk(root as unknown as Node);
  };
}
export function contentReferences(raw: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(forumSyntax([]));
  const root = processor.runSync(processor.parse(raw), { value: raw });
  const refs: { thread: number; reply: number; kind: string }[] = [];
  function visit(n: Node) {
    if (["code", "inlineCode", "math", "inlineMath", "html"].includes(n.type))
      return;
    if (n.data?.reference) {
      refs.push({ ...n.data.reference, kind: "quote" });
      n.children?.forEach(visit);
      return;
    }
    if (n.type === "link" && n.url) {
      const t = internalTarget(n.url);
      if (t) refs.push({ ...t, kind: "link" });
    }
    n.children?.forEach(visit);
  }
  visit(root as unknown as Node);
  return refs;
}

export function contentExcerpt(raw: string) {
  const p = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(forumSyntax([]));
  const tree = p.runSync(p.parse(raw), { value: raw });
  const parts: string[] = [];
  function visit(n: Node) {
    if (n.type === "html" || n.type === "image") return;
    if (n.value) parts.push(n.value);
    const children = n.children;
    children?.forEach(visit);
  }
  visit(tree as unknown as Node);
  return parts.join(" ").replace(/\s+/g, " ").slice(0, 160);
}
