"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { createReplyAction } from "@/app/actions/forum";
import type { ActionState } from "@/app/actions/auth";
import { EmojiPicker } from "./EmojiPicker";
import { MarkdownPreview } from "./MarkdownPreview";
import { ImagePicker } from "./ImagePicker";
import { SubmitButton } from "./SubmitButton";
import { AttachmentPicker } from "./AttachmentPicker";
import { DOCUMENT_LIMITS } from "@/lib/attachment-limits";
import { VISIBILITY_OPTIONS } from "@/lib/visibility";

export function ReplyForm({
  threadId,
  nickname,
  quote,
}: {
  threadId: number;
  nickname: string;
  quote?: { replyTo: number; floor: number; nickname: string; content: string };
}) {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [imagesBusy, setImagesBusy] = useState(false);
  const [attachmentKey, setAttachmentKey] = useState(0);
  const [uploadError, setUploadError] = useState("");

  function validateUploads(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const total = [...data.getAll("images"), ...data.getAll("attachments")]
      .reduce<number>((size, value) => size + (value instanceof File ? value.size : 0), 0);
    if (imagesBusy || total > DOCUMENT_LIMITS.maxSubmissionBytes) {
      event.preventDefault();
      setUploadError(imagesBusy ? "图片处理中，请稍候" : `图片和附件合计不能超过 ${DOCUMENT_LIMITS.maxSubmissionBytes / 1024 / 1024} MB，请减少文件后重试`);
    } else {
      setUploadError("");
    }
  }

  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, data) => {
    const result = await createReplyAction(previous, data);
    if (!result) {
      setContent("");
      setUploadError("");
      setAttachmentKey((key) => key + 1);
    }
    return result;
  }, null);
  return (
    <form action={formAction} onSubmit={validateUploads} onReset={(event) => event.preventDefault()} id="reply-form" className="card mt-4 scroll-mt-24 p-4">
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="reply_to" value={quote?.replyTo ?? 0} />
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-sm font-medium">
          {quote ? (
            <span>
              回复 <b>@{quote.nickname}</b> 的 #{quote.floor} 楼
            </span>
          ) : (
            `回复 · ${nickname}`
          )}
        </label>
        <EmojiPicker targetRef={contentRef} onChange={setContent} />
      </div>
      {quote && (
        <div className="mb-3 rounded-md border-l-4 border-brand/60 bg-soft/70 px-3 py-2 text-xs text-muted">
          {quote.content.slice(0, 80)}
          {quote.content.length > 80 ? "…" : ""}
          <Link href={`/t/${threadId}#reply-form`} className="ml-2 text-brand hover:underline">
            取消引用
          </Link>
        </div>
      )}
      {state && !state.ok && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </div>
      )}
      {uploadError && <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
      <div className={`grid gap-3 ${preview ? "md:grid-cols-2" : ""}`}>
        <textarea
          ref={contentRef}
          name="content"
          required
          rows={4}
          maxLength={10000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="input resize-y"
          placeholder="友善回复，理性讨论…"
        />
        {preview && (
          <div className="input min-h-24 overflow-auto bg-soft/40">
            <MarkdownPreview content={content} className="text-sm" />
          </div>
        )}
      </div>
      <p className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span />
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          className={`rounded-full px-2.5 py-1 ${
            preview ? "bg-brand text-white" : "hover:bg-soft"
          }`}
        >
          {preview ? "✏️ 继续编辑" : "👁 实时预览"}
        </button>
      </p>
      <div className="mt-3">
        <label className="mb-1 block text-sm font-medium">图片</label>
        <ImagePicker key={attachmentKey} max={2} onBusyChange={setImagesBusy} />
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-sm font-medium">附件</label>
        <AttachmentPicker key={attachmentKey} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
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
        <SubmitButton disabled={imagesBusy}>↩︎ 回复</SubmitButton>
      </div>
    </form>
  );
}
