"use client";

import { useActionState, useRef, useState } from "react";
import { createThreadAction } from "@/app/actions/forum";
import type { ActionState } from "@/app/actions/auth";
import type { BoardRow } from "@/lib/queries";
import { EmojiPicker } from "./EmojiPicker";
import { formatEditorSelection, type EditorCommand } from "@/lib/editor";
import { MarkdownPreview } from "./MarkdownPreview";
import { ImagePicker } from "./ImagePicker";
import { SubmitButton } from "./SubmitButton";

const CAT_ORDER = ["学习成长", "年级群", "生活娱乐", "球友", "游戏", "交易互助", "情感联结", "官方"];
const CAT_EMOJI: Record<string, string> = {
  学习成长: "📖",
  年级群: "🎓",
  生活娱乐: "🎨",
  球友: "🏀",
  游戏: "🎮",
  交易互助: "🤝",
  情感联结: "💚",
  官方: "📢",
};

export function NewThreadForm({
  boards,
  defaultBoardId,
  isAdmin,
  recommendationEnabled,
}: {
  boards: BoardRow[];
  defaultBoardId?: number;
  isAdmin: boolean;
  recommendationEnabled: boolean;
}) {
  const [preparing, setPreparing] = useState(false);
  const [encodingNotice, setEncodingNotice] = useState("");
  const cachedVector = useRef<{text:string;encoded:string;version:string} | null>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, form) => {
    const title = String(form.get("title") ?? ""), body = String(form.get("content") ?? "");
    // Server validation remains authoritative; do not download a model for an empty draft.
    if (recommendationEnabled && title.trim().length>=2 && body.trim().length>=2) {
      setPreparing(true);setEncodingNotice("");
      try {
        const text = `${title.trim()}\n${body.trim()}`;
        if (cachedVector.current?.text !== text) {
          const { encodePost } = await import("@/lib/recommendation/encoder");
          cachedVector.current = {text,...await encodePost(title,body)};
        }
        form.set("post_vec",cachedVector.current.encoded);
        form.set("vec_model_version",cachedVector.current.version);
      } catch { setEncodingNotice("推荐准备暂不可用，帖子仍会正常发布。"); }
      finally { setPreparing(false); }
    }
    return createThreadAction(previous,form);
  }, null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);

  const TOOLBAR: Array<{ cmd: EditorCommand; label: string; title: string }> = [
    { cmd: "bold", label: "B", title: "加粗" },
    { cmd: "italic", label: "I", title: "斜体" },
    { cmd: "heading", label: "H", title: "标题" },
    { cmd: "quote", label: "❝", title: "引用" },
    { cmd: "list", label: "• 列表", title: "无序列表" },
    { cmd: "ordered", label: "1. 列表", title: "有序列表" },
    { cmd: "link", label: "🔗 链接", title: "插入链接" },
    { cmd: "code", label: "‹›", title: "行内代码" },
    { cmd: "math", label: "$", title: "行内公式" },
    { cmd: "display-math", label: "$$", title: "公式块" },
  ];

  function applyFormat(cmd: EditorCommand) {
    const el = contentRef.current;
    if (!el) return;
    const next = formatEditorSelection(
      { value: el.value, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 },
      cmd
    );
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(el, next.value);
    el.selectionStart = next.start;
    el.selectionEnd = next.end;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }
  const visible = isAdmin ? boards : boards.filter((b) => b.slug !== "announcements");

  // 两级选择：先大类，再板块
  const defaultBoard = visible.find((b) => b.id === defaultBoardId);
  const [cat, setCat] = useState<string>(defaultBoard?.category ?? "");
  const [boardId, setBoardId] = useState<string>(defaultBoard ? String(defaultBoard.id) : "");
  const cats = CAT_ORDER.filter((c) => visible.some((b) => b.category === c));
  const catBoards = visible.filter((b) => b.category === cat);
  const isConfession = boardId === String(visible.find((b) => b.slug === "confession")?.id);

  function changeCat(c: string) {
    setCat(c);
    const first = visible.find((b) => b.category === c);
    if (first) setBoardId(String(first.id));
  }

  return (
    <form action={formAction} className="space-y-4 p-4">
      {(preparing || encodingNotice) && <p className="text-sm text-muted" role="status">{preparing ? "正在准备发布，首次使用需要下载推荐组件…" : encodingNotice}</p>}
      {state && !state.ok && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">① 选择大类</label>
          <select
            value={cat}
            required
            className="input"
            onChange={(e) => changeCat(e.target.value)}
          >
            <option value="" disabled>
              请选择大类…
            </option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {CAT_EMOJI[c] ?? ""} {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">② 选择板块</label>
          <select
            name="board_id"
            value={boardId}
            required
            disabled={!cat}
            className="input disabled:opacity-50"
            onChange={(e) => setBoardId(e.target.value)}
          >
            {!cat ? (
              <option value="">先选择大类…</option>
            ) : (
              catBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.icon} {b.name}
                  {b.grade_lock ? `（仅限${b.grade_lock}）` : ""}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">标题</label>
        <input
          name="title"
          required
          minLength={2}
          maxLength={60}
          className="input"
          placeholder="一句话说清你的主题（2-60 字）"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium">正文</label>
          <button
            type="button"
            onClick={() => setPreview(!preview)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              preview ? "bg-brand text-white" : "text-muted hover:bg-soft"
            }`}
          >
            {preview ? "✏️ 继续编辑" : "👁 实时预览"}
          </button>
        </div>
        <div className={`grid gap-3 ${preview ? "md:grid-cols-2" : ""}`}>
          <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            {TOOLBAR.map((t) => (
              <button
                key={t.cmd}
                type="button"
                title={t.title}
                onClick={() => applyFormat(t.cmd)}
                className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:bg-soft hover:text-ink"
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <textarea
              ref={contentRef}
              name="content"
              required
              minLength={2}
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input resize-y pr-10"
              placeholder="支持 Markdown · @用户名 · $LaTeX$ 公式"
            />
            <div className="absolute right-2 top-2">
              <EmojiPicker targetRef={contentRef} />
            </div>
          </div>
          </div>
          {preview && (
            <div className="input min-h-48 overflow-auto bg-soft/40">
              <MarkdownPreview content={content} className="text-sm" />
            </div>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          支持 Markdown 语法、@用户名 提及、$LaTeX$ 公式（$x^2$）、表情。请友善发言（遵守社区公约）。
        </p>
      </div>
      {isConfession && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-soft/60 px-3 py-2.5 text-sm">
          <input type="checkbox" name="anonymous" className="h-4 w-4 accent-[#0e7490]" />
          <span>
            匿名发表
            <span className="ml-1 text-xs text-muted">（展示为「匿名同学」；管理员仍可查看作者以维护秩序）</span>
          </span>
        </label>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">图片（最多 4 张，自动压缩）</label>
        <ImagePicker max={4} />
        <p className="mt-1.5 text-xs text-muted">
          支持 JPG / PNG / WEBP / GIF，上传前自动压缩，共 4 张以内。
        </p>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="发布中…">🚀 发布帖子</SubmitButton>
      </div>
    </form>
  );
}
