"use client";
import { type ReactNode } from "react";
import { formatEditorSelection, insertQuoteBlock, insertSpoilerBlock, insertDetailsBlock, type EditorCommand } from "@/lib/editor";

type Tool = { cmd: EditorCommand | "quote" | "spoiler" | "details"; label: string; title: string };
const GROUPS: Tool[][] = [
  [
    { cmd: "bold", label: "B", title: "加粗 Ctrl+B" },
    { cmd: "italic", label: "I", title: "斜体 Ctrl+I" },
    { cmd: "heading", label: "H", title: "标题" },
  ],
  [
    { cmd: "link", label: "🔗", title: "插入链接" },
    { cmd: "quote", label: "❝", title: "插入引用块" },
    { cmd: "spoiler", label: "🫥", title: "模糊剧透" },
    { cmd: "details", label: "⏷", title: "折叠信息" },
  ],
];

/** Ctrl/⌘+B/I 快捷键：与工具栏共用一套格式化逻辑（tooltip 里只提示真实存在的快捷键）。 */
export function composerShortcutHandler(onChange: (value: string) => void) {
  return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const cmd: EditorCommand | null = e.key === "b" ? "bold" : e.key === "i" ? "italic" : null;
    if (!cmd) return;
    e.preventDefault();
    const el = e.currentTarget;
    const next = formatEditorSelection(
      { value: el.value, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 },
      cmd,
    );
    onChange(next.value);
    requestAnimationFrame(() => {
      el.selectionStart = next.start;
      el.selectionEnd = next.end;
    });
  };
}

/** 发帖与回复共用的格式化工具栏：分组排列、ARIA 齐全；
 * children 追加在末尾（图片/附件/表情入口由调用方传入）。 */
export function ComposerToolbar({
  targetRef,
  onChange,
  children,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  function applySelection(next: { value: string; start: number; end: number }) {
    const el = targetRef.current;
    onChange(next.value);
    requestAnimationFrame(() => {
      if (!el) return;
      el.selectionStart = next.start;
      el.selectionEnd = next.end;
      el.focus();
    });
  }
  return (
    <div className="composer-tools" role="toolbar" aria-label="格式化工具栏">
      {GROUPS.map((group, index) => (
        <span key={index} className="tool-group">
          {group.map((t) => (
            <button
              key={t.cmd}
              type="button"
              title={t.title}
              aria-label={t.title}
              className="post-text-action"
              onClick={() => {
                const el = targetRef.current;
                if (!el) return;
                const source = { value: el.value, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
                const next =
                  t.cmd === "quote"
                    ? insertQuoteBlock(source)
                    : t.cmd === "spoiler"
                      ? insertSpoilerBlock(source)
                      : t.cmd === "details"
                        ? insertDetailsBlock(source)
                        : formatEditorSelection(source, t.cmd as EditorCommand);
                applySelection(next);
              }}
            >
              {t.label}
            </button>
          ))}
        </span>
      ))}
      <span className="tool-group">{children}</span>
    </div>
  );
}

/** 工具栏里的图片入口：借助 InlineUpload 监听的 forum-open-images 事件打开文件选择。 */
export function ImageToolButton() {
  return (
    <button
      type="button"
      title="插入图片"
      aria-label="插入图片"
      className="post-text-action"
      onClick={() => window.dispatchEvent(new CustomEvent("forum-open-images"))}
    >
      ▧
    </button>
  );
}

/** 工具栏里的附件入口：AttachmentPicker 监听 forum-open-attachments 打开文件选择。 */
export function AttachmentToolButton() {
  return (
    <button
      type="button"
      title="添加附件"
      aria-label="添加附件"
      className="post-text-action"
      onClick={() => window.dispatchEvent(new CustomEvent("forum-open-attachments"))}
    >
      📎
    </button>
  );
}
