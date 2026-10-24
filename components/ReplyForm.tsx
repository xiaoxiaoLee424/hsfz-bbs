"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createReplyAction } from "@/app/actions/forum";
import type { ActionState } from "@/app/actions/auth";
import { ComposerBody, useComposerPreview } from "./ComposerBody";
import { ComposerAutocomplete } from "./ComposerAutocomplete";
import { SubmitButton } from "./SubmitButton";
import { DOCUMENT_LIMITS } from "@/lib/attachment-limits";
import { VISIBILITY_OPTIONS } from "@/lib/visibility";

export function ReplyForm({
  threadId,
  nickname,
  threadTitle,
  quote,
}: {
  threadId: number;
  nickname: string;
  threadTitle?: string;
  quote?: { replyTo: number; floor: number; nickname: string; content: string };
}) {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [target, setTarget] = useState<{
    replyTo: number;
    nickname: string;
  } | null>(
    quote ? { replyTo: quote.replyTo, nickname: quote.nickname } : null,
  );
  const [content, setContent] = useState("");
  // 「正文引用了谁」与「回复给谁」是两条独立线索（规格 §6 SHOULD）：从源码统计带来源的引用块
  const quoteCount = useMemo(
    () => (content.match(/\[quote thread=\d+ reply=\d+\]/g) ?? []).length,
    [content],
  );
  useEffect(() => {
    const handler = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      const el = contentRef.current;
      if (!el) return;
      const start = el.selectionStart,
        end = el.selectionEnd;
      setContent((value) => value.slice(0, start) + text + value.slice(end));
      el.focus();
    };
    const reply = (event: Event) => {
      const next = (event as CustomEvent).detail;
      setTarget(next);
      elFocus();
    };
    function elFocus() {
      document
        .getElementById("reply-form")
        ?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      contentRef.current?.focus();
    }
    const insert = (event: Event) => {
      handler(event);
      elFocus();
    };
    window.addEventListener("forum-reply", reply);
    window.addEventListener("forum-quote", insert);
    return () => {
      window.removeEventListener("forum-quote", insert);
      window.removeEventListener("forum-reply", reply);
    };
  }, []);
  const preview = useComposerPreview();
  const [inlineBusy, setInlineBusy] = useState(false);
  const [attachmentKey, setAttachmentKey] = useState(0);
  const [uploadError, setUploadError] = useState("");

  function validateUploads(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const total = [...data.getAll("images"), ...data.getAll("attachments")]
      .reduce<number>((size, value) => size + (value instanceof File ? value.size : 0), 0);
    if (inlineBusy || total > DOCUMENT_LIMITS.maxSubmissionBytes) {
      event.preventDefault();
      setUploadError(
        inlineBusy
          ? "图片处理中，请稍候"
          : `图片和附件合计不能超过 ${DOCUMENT_LIMITS.maxSubmissionBytes / 1024 / 1024} MB，请减少文件后重试`,
      );
    } else {
      setUploadError("");
    }
  }

  const [state, formAction] = useActionState<ActionState, FormData>(
    async (previous, data) => {
      const result = await createReplyAction(previous, data);
      if (!result) {
        setContent("");
        setUploadError("");
        setAttachmentKey((key) => key + 1);
      }
      return result;
    },
    null,
  );
  return (
    <form
      action={formAction}
      onSubmit={validateUploads}
      onReset={(event) => event.preventDefault()}
      id="reply-form"
      className="card mt-4 scroll-mt-24 p-4"
    >
      <input type="hidden" name="reply_target_set" value={target?1:0}/>
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="reply_to" value={target?.replyTo ?? 0} />
      <div className="composer-header mb-2 flex flex-wrap items-center gap-2">
        <strong className="text-sm font-medium">
          {threadTitle ? `↩ 回复主题：《${threadTitle}》` : `✎ 撰写回复 · ${nickname}`}
        </strong>
        {target && (
          <span className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-xs text-muted">
            ↩ 回复给 @{target.nickname}
            <button
              type="button"
              className="text-muted hover:text-red-600 dark:text-red-400"
              aria-label="关闭回复目标"
              onClick={() => setTarget(null)}
            >
              ×
            </button>
          </span>
        )}
        {quoteCount > 0 && (
          <span className="text-xs text-muted">
            ❝ 已引用 {quoteCount} 处（不改变回复目标）
          </span>
        )}
      </div>
      {state && !state.ok && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </div>
      )}
      {uploadError && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {uploadError}
        </p>
      )}
      <ComposerBody
        targetRef={contentRef}
        onChange={setContent}
        content={content}
        onInlineBusyChange={setInlineBusy}
        resetKey={attachmentKey}
        preview={preview}
        textarea={{
          name: "content",
          required: true,
          maxLength: 10000,
          placeholder: "友善回复，理性讨论…",
          "aria-label": "编辑回复内容",
        }}
      />
      <ComposerAutocomplete targetRef={contentRef} onChange={setContent} />
      <div className="composer-footer mt-3 flex flex-wrap items-center justify-end gap-2">
        <label className="mr-auto flex items-center gap-1.5 text-xs text-muted">
          <span>可见范围</span>
          <select name="visibility" defaultValue="public" className="input !w-auto !px-2 !py-1 !text-xs">
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
        <button
          type="button"
          className="post-text-action"
          onClick={() => {
            if (content && !confirm("丢弃未发布的草稿？")) return;
            setContent("");
            setTarget(null);
          }}
        >
          取消
        </button>
        <SubmitButton disabled={inlineBusy}>↩︎ 回复</SubmitButton>
      </div>
    </form>
  );
}
