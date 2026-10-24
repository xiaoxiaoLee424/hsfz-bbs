"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import { createThreadAction } from "@/app/actions/forum";
import type { ActionState } from "@/app/actions/auth";
import type { BoardRow } from "@/lib/queries";
import { CAT_ORDER, CAT_EMOJI } from "@/lib/categories";
import { ComposerAutocomplete } from "./ComposerAutocomplete";
import { ComposerBody, useComposerPreview } from "./ComposerBody";
import { SubmitButton } from "./SubmitButton";
import { DOCUMENT_LIMITS } from "@/lib/attachment-limits";
import { VISIBILITY_OPTIONS } from "@/lib/visibility";

export function NewThreadForm({
  boards,
  defaultBoardId,
  isAdmin,
}: {
  boards: BoardRow[];
  defaultBoardId?: number;
  isAdmin: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createThreadAction, null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const preview = useComposerPreview();
  const [inlineBusy, setInlineBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function validateUploads(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const total = [...data.getAll("images"), ...data.getAll("attachments")]
      .reduce<number>((size, value) => size + (value instanceof File ? value.size : 0), 0);
    if (inlineBusy || total > DOCUMENT_LIMITS.maxSubmissionBytes) {
      event.preventDefault();
      setUploadError(inlineBusy ? "图片处理中，请稍候" : `图片和附件合计不能超过 ${DOCUMENT_LIMITS.maxSubmissionBytes / 1024 / 1024} MB，请减少文件后重试`);
    } else {
      setUploadError("");
    }
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
    <form action={formAction} onSubmit={validateUploads} onReset={(event) => event.preventDefault()} className="space-y-4 p-4">
      {uploadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
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
        <label className="mb-1 block text-sm font-medium">可见范围</label>
        <select name="visibility" defaultValue="public" className="input">
          {VISIBILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} · {option.hint}
            </option>
          ))}
        </select>
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
      <ComposerBody
        targetRef={contentRef}
        onChange={setContent}
        content={content}
        onInlineBusyChange={setInlineBusy}
        preview={preview}
        textarea={{
          name: "content",
          required: true,
          minLength: 2,
          maxLength: 20000,
          placeholder: "正文",
          "aria-label": "发帖正文",
        }}
      />
      {isConfession && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border-[1.5px] border-line bg-soft/60 px-3 py-2.5 text-sm">
          <input type="checkbox" name="anonymous" className="h-4 w-4 accent-[var(--tertiary)]" />
          <span>
            匿名发表
            <span className="ml-1 text-xs text-muted">（展示为「匿名同学」；管理员仍可查看作者以维护秩序）</span>
          </span>
        </label>
      )}
      <ComposerAutocomplete targetRef={contentRef} onChange={setContent}/>
      <div className="composer-footer flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted">请友善发言（遵守社区公约）。</span>
        <button
          type="button"
          onClick={preview.toggle}
          aria-pressed={preview.pressed}
          className={`rounded-full px-2.5 py-1 text-xs ${
            preview.pressed ? "bg-brand text-white" : "hover:bg-soft"
          }`}
        >
          {preview.label}
        </button>
        <SubmitButton disabled={inlineBusy} pendingText="发布中…">🚀 发布帖子</SubmitButton>
      </div>
    </form>
  );
}
