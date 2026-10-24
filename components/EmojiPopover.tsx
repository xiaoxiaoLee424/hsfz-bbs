"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** 供 Picker 专用的数据副本：name 换成 :id:，让网格按钮的原生 title 显示 short code，
 * 同时冒号形式成为搜索分词（:smi 可命中）；原英文名拆词并入 keywords，按名字搜索不失效。
 * 只在首次打开时处理一次并缓存，之后复用同一对象交给 Picker 初始化。 */
let shortcodePickerData: unknown = null;
function buildShortcodePickerData(data: unknown) {
  const clone = structuredClone(data) as {
    emojis: Record<string, { name: string; keywords?: string[] }>;
  };
  for (const [id, emoji] of Object.entries(clone.emojis)) {
    const words = String(emoji.name || "")
      .toLowerCase()
      .split(/[\s-]+/)
      .filter(Boolean);
    emoji.keywords = [...new Set([...(emoji.keywords ?? []), ...words])];
    emoji.name = `:${id}:`;
  }
  return clone;
}

export function EmojiPopover({
  onSelect,
  children,
}: {
  onSelect: (entry: { key: string; code: string }) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const anchor = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let picker: HTMLElement | undefined;
    const place = () => {
      if (!panel.current || !anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 16),
        height = Math.min(440, window.innerHeight - 32);
      Object.assign(panel.current.style, {
        width: width + "px",
        maxHeight: height + "px",
        left:
          Math.max(
            8,
            Math.min(rect.right - width, window.innerWidth - width - 8),
          ) + "px",
        top:
          Math.max(
            8,
            Math.min(rect.bottom + 8, window.innerHeight - height - 8),
          ) + "px",
      });
    };
    place();
    Promise.all([
      import("emoji-mart"),
      import("@emoji-mart/data"),
      import("@emoji-mart/data/i18n/zh.json"),
      fetch("/api/emojis").then((r) => {
        if (!r.ok) throw new Error("加载失败");
        return r.json();
      }),
    ])
      .then(
        ([{ Picker, Store }, { default: rawData }, { default: i18n }, custom]) => {
          if (disposed) return;
          shortcodePickerData ??= buildShortcodePickerData(rawData);
          const activeCustom = (
            custom as {
              id: number;
              name: string;
              image_path: string;
              active: number;
              keywords: string;
              category: string;
            }[]
          ).filter((e) => e.active);
          const toEntry = (e: {
            id: number;
            name: string;
            image_path: string;
            keywords: string;
          }) => ({
            id: "custom:" + e.id,
            name: ":" + e.name + ":",
            // 裸名 + keywords 列（空格分隔，含学校全称的单词）供搜索：不带冒号也能命中
            keywords: [e.name, ...e.keywords.split(/\s+/).filter(Boolean)],
            skins: [{ src: e.image_path }],
          });
          const customCategories = [
            {
              id: "custom",
              name: "自定义表情",
              emojis: activeCustom
                .filter((e) => e.category !== "university")
                .map(toEntry),
            },
            {
              id: "universities",
              name: "大学校徽",
              emojis: activeCustom
                .filter((e) => e.category === "university")
                .map(toEntry),
            },
          ].filter((group) => group.emojis.length > 0);
          const customName = new Map(
            activeCustom.map((e) => [String(e.id), e.name]),
          );
          const store = Store as unknown as {
            get: (key: string) => unknown;
            set: (key: string, value: unknown) => void;
          };
          if (!store.get("frequently")) store.set("frequently", {});
          picker = new Picker({
            data: shortcodePickerData,
            i18n,
            perLine: Math.max(
              6,
              Math.floor((Math.min(352, window.innerWidth - 16) - 32) / 36),
            ),
            locale: "zh",
            theme: document.documentElement.classList.contains("dark")
              ? "dark"
              : "light",
            set: "native",
            maxFrequentRows: 2,
            previewPosition: "none",
            onEmojiSelect: (e: {
              id: string;
              native?: string;
              shortcodes?: string;
            }) => {
              // key 是互动存储格式（reaction 原样使用）：标准表情为 unicode 字符、自定义表情为 custom:ID；
              // code 是正文插入用的 :short_code:（肤色选择会带 ::skin-tone-N 后缀）。
              const isCustom = e.id.startsWith("custom:");
              onSelect({
                key: isCustom ? e.id : e.native || e.id,
                code: isCustom
                  ? `:${customName.get(e.id.slice(7)) ?? e.id.slice(7)}:`
                  : e.shortcodes || `:${e.id}:`,
              });
              setOpen(false);
              anchor.current?.focus();
            },
            custom: customCategories,
          }) as unknown as HTMLElement;
          panel.current?.replaceChildren(picker);
          place();
        },
      )
      .catch((e) => setError(String(e)));
    const outside = (e: PointerEvent) => {
      if (
        !e.composedPath().includes(panel.current as EventTarget) &&
        !anchor.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        anchor.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      disposed = true;
      picker?.remove();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, onSelect]);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="post-icon"
        aria-label="添加表情"
        aria-expanded={open}
        onClick={() => {
          setError("");
          setOpen(!open);
        }}
      >
        {children || "☺"}
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Emoji Picker"
          className="emoji-popover"
        >
          <span role="status">{error || "加载表情…"}</span>
        </div>
      )}
    </>
  );
}
