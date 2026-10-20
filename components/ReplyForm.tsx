"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createReplyAction } from "@/app/actions/forum";
import type { ActionState } from "@/app/actions/auth";
import { MarkdownEditor } from "./MarkdownEditor";
import { ImagePicker } from "./ImagePicker";
import { SubmitButton } from "./SubmitButton";

export function ReplyForm({
  threadId,
  nickname,
  quote,
}: {
  threadId: number;
  nickname: string;
  quote?: { replyTo: number; floor: number; nickname: string; content: string };
}) {
  const [content, setContent] = useState("");
  const [version, setVersion] = useState(0);
  const imageRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (previous, form) => {
    const result = await createReplyAction(previous, form);
    if (!result || result.ok) { setContent(""); setVersion(v => v + 1); }
    return result;
  }, null);
  return (
    <form action={formAction} id="reply-form" className="card mt-4 scroll-mt-24 p-4">
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="reply_to" value={quote?.replyTo ?? 0} />
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor="reply-content" className="block text-sm font-medium">
          {quote ? (
            <span>
             回复 <b>@{quote.nickname}</b>的 #{quote.floor} 楼
            </span>
          ) : (
            `回复 · ${nickname}`
          )}
        </label>
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
      <MarkdownEditor key={version} id="reply-content" value={content} onChange={setContent} required rows={5} disabled={pending} placeholder="友善回复，理性讨论…" onAttach={() => imageRef.current?.click()} attachmentLabel="上传图片（最多 2 张）" />
      <div className="mt-3">
        <ImagePicker key={version} max={2} externalInputRef={imageRef} hideTrigger disabled={pending} />
        <p className="mt-1.5 text-xs text-muted">点击工具栏的附件图标，可附 2 张图片，上传前自动压缩。</p>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton icon="send">回复</SubmitButton>
      </div>
    </form>
  );
}
