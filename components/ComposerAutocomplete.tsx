/* eslint-disable @next/next/no-img-element -- 补全候选里的自定义表情为用户上传的小图，保持原生尺寸 */
"use client";
import { useEffect, useRef, useState, useId } from "react";
import { rankEmojiCodes, type EmojiCodeItem } from "@/lib/emoji-search";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
type Item = {
  value?: string;
  kind?: "standard" | "custom";
  code?: string;
  native?: string;
  image?: string;
  label?: string;
};
const MAX_SUGGESTIONS = 8;
export function ComposerAutocomplete({
  targetRef,
  onChange,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [selected, setSelected] = useState(0),
    [top, setTop] = useState(0),
    [left, setLeft] = useState(0);
  const codes = useRef<EmojiCodeItem[]>([]),
    range = useRef({ start: 0, end: 0, value: "" }),
    choose = useRef<(i: number) => void>(() => {}),
    id = useId();
  useEffect(() => {
    fetch("/api/emoji-codes")
      .then((r) => r.json())
      .then((r) => {
        codes.current = r;
      })
      .catch(console.error);
  }, []);
  useEffect(() => {
    choose.current = (index) => {
      const el = targetRef.current,
        item = items[index],
        saved = range.current;
      if (!el || !item || el.value !== saved.value) return;
      const value = item.kind ? `:${item.code}: ` : (item.value ?? "") + " ";
      onChange(
        el.value.slice(0, saved.start) + value + el.value.slice(saved.end),
      );
      setItems([]);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(
          saved.start + value.length,
          saved.start + value.length,
        );
      });
    };
  }, [items, onChange, targetRef]);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    let composing = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      request: AbortController | undefined,
      generation = 0;
    const close = () => {
      generation++;
      request?.abort();
      clearTimeout(timer);
      setItems([]);
    };
    const refresh = () => {
      close();
      if (composing || el.selectionStart !== el.selectionEnd) return;
      const end = el.selectionStart,
        before = el.value.slice(0, end),
        match = /(?:^|[\s(（])([@:])([^\s@:()[\]{}<>]{1,32})$/.exec(before);
      if (!match) return;
      const tree = parser.parse(el.value);
      let excluded = false;
      const forbidden = new Set([
        "code",
        "inlineCode",
        "math",
        "inlineMath",
        "link",
        "linkReference",
        "image",
        "html",
      ]);
      function visit(node: typeof tree | (typeof tree.children)[number]) {
        const a = node.position?.start.offset,
          b = node.position?.end.offset;
        if (
          a !== undefined &&
          b !== undefined &&
          a <= end &&
          end <= b &&
          forbidden.has(node.type)
        )
          excluded = true;
        if ("children" in node)
          node.children.forEach((n) =>
            visit(n as (typeof tree.children)[number]),
          );
      }
      visit(tree);
      if (excluded) return;
      const rect = el.getBoundingClientRect();
      setTop(Math.min(rect.bottom, window.innerHeight - 260));
      setLeft(Math.max(8, Math.min(rect.left, window.innerWidth - 300)));
      range.current = {
        start: end - match[2].length - 1,
        end,
        value: el.value,
      };
      setSelected(0);
      if (match[1] === ":") {
        setItems(
          rankEmojiCodes(codes.current, match[2].toLowerCase()).slice(
            0,
            MAX_SUGGESTIONS,
          ),
        );
        return;
      }
      const current = generation;
      timer = setTimeout(() => {
        request = new AbortController();
        fetch("/api/users/suggest?q=" + encodeURIComponent(match[2]), {
          signal: request.signal,
        })
          .then((r) => {
            if (!r.ok) throw new Error("用户搜索失败");
            return r.json();
          })
          .then((users: { username: string; nickname: string }[]) => {
            if (current === generation)
              setItems(
                users.map((u) => ({
                  label: `${u.nickname} @${u.username}`,
                  value: "@" + u.username,
                })),
              );
          })
          .catch((e) => {
            if (e.name !== "AbortError") console.error(e);
          });
      }, 200);
    };
    const start = () => {
        composing = true;
        close();
      },
      end = () => {
        composing = false;
        refresh();
      };
    el.addEventListener("input", refresh);
    el.addEventListener("click", refresh);
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    el.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    return () => {
      close();
      el.removeEventListener("input", refresh);
      el.removeEventListener("click", refresh);
      el.removeEventListener("compositionstart", start);
      el.removeEventListener("compositionend", end);
      el.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [targetRef]);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const key = (e: KeyboardEvent) => {
      if (!items.length || e.isComposing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(
          (n) =>
            (n + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose.current(selected);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setItems([]);
      } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
        setItems([]);
    };
    el.addEventListener("keydown", key);
    el.setAttribute("aria-controls", id);
    el.setAttribute("aria-expanded", String(items.length > 0));
    return () => {
      el.removeEventListener("keydown", key);
      el.removeAttribute("aria-controls");
      el.removeAttribute("aria-expanded");
    };
  }, [items, selected, id, targetRef]);
  return items.length ? (
    <div
      id={id}
      role="listbox"
      className="fixed z-[100] max-h-60 w-72 overflow-auto rounded border border-line bg-card p-1 shadow-lg"
      style={{ top, left }}
    >
      {items.map((item, i) => (
        <button
          type="button"
          role="option"
          aria-selected={i === selected}
          key={item.code}
          className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm ${i === selected ? "bg-soft text-brand" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose.current(i)}
        >
          {item.kind ? (
            item.kind === "custom" ? (
              <img
                src={item.image}
                alt=""
                width={22}
                height={22}
                className="shrink-0 object-contain"
                loading="lazy"
              />
            ) : (
              <span className="inline-block w-[22px] shrink-0 text-center text-lg leading-none">
                {item.native}
              </span>
            )
          ) : (
            <span className="w-[22px] shrink-0" />
          )}
          <span className="min-w-0 truncate">
            {item.kind ? `:${item.code}:` : item.label}
          </span>
        </button>
      ))}
    </div>
  ) : null;
}
