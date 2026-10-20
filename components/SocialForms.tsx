"use client";
import { IconButton } from "./IconAction";
import { useActionState, useRef, useState, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { startConversationAction, createGroupAction, membershipAction, sendMessageAction, markChatReadAction } from "@/app/actions/social";
import { SubmitButton } from "./SubmitButton";
import { MarkdownEditor } from "./MarkdownEditor";
import type { ActionState } from "@/app/actions/auth";
import { compressFile, formatFileSize, MAX_FILE_BYTES } from "@/lib/file-transfer";

function ErrorMessage({ state }: { state: ActionState }) {
  return state && !state.ok ? <p className="form-error" role="alert">{state.message}</p> : null;
}
export function StartConversationForm({ username = "" }: { username?: string }) {
  const [state, action] = useActionState(startConversationAction, null);
  return <form action={action} className="space-y-3">
    <label className="field-label" htmlFor="recipient">对方的用户名</label>
    <div className="flex gap-2"><input id="recipient" className="input min-w-0" name="username" defaultValue={username} placeholder="如 chen2026" required maxLength={20} />
      <SubmitButton icon="message" pendingText="打开中…">开始私信</SubmitButton></div>
    <ErrorMessage state={state} />
    <p className="text-xs text-muted">在同学的个人主页也可以直接发起私信。</p>
  </form>;
}
export function CreateGroupForm() {
  const [state, action] = useActionState(createGroupAction, null);
  return <form action={action} className="space-y-4">
    <ErrorMessage state={state} />
    <div><label className="field-label" htmlFor="group-name">小组名称</label><input id="group-name" name="name" className="input" placeholder="给共同的兴趣取个名字" required minLength={2} maxLength={40} /></div>
    <div><label className="field-label" htmlFor="group-description">小组介绍</label><textarea id="group-description" name="description" className="input" rows={3} maxLength={500} placeholder="聊什么、适合谁加入、有什么约定" /></div>
    <p className="text-xs text-muted">小组可被所有人发现；加入后才能查看成员和参与讨论。创建者将成为组长。</p>
    <SubmitButton icon="group-plus" pendingText="创建中…">创建小组</SubmitButton>
  </form>;
}
export function MembershipForm({ id, joined, owner = false }: { id: number; joined: boolean; owner?: boolean }) {
  const [state, action] = useActionState(membershipAction, null);
  if (owner) return <span className="pill bg-soft text-muted">你是组长</span>;
  return <form action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="operation" value={joined ? "leave" : "join"} />
    <SubmitButton className={joined ? "btn" : "btn-primary"} icon={joined ? "user-minus" : "user-plus"} pendingText="处理中…">{joined ? "退出小组" : "加入小组"}</SubmitButton>
    <ErrorMessage state={state} />
  </form>;
}
export function MessageComposer({ kind, id }: { kind: "direct" | "group"; id: number }) {
  const [content, setContent] = useState("");
  const [draftVersion, setDraftVersion] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [phase, setPhase] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    try {
      if (file) {
        setPhase("正在压缩文件…");
        const compressed = await compressFile(file);
        form.set("attachment", compressed, "attachment.gz");
        form.set("attachment_name", file.name);
        form.set("attachment_size", String(file.size));
      }
      setPhase(file ? "正在上传压缩文件…" : "正在发送…");
      const result = await sendMessageAction(prev, form);
      if (result?.ok) {
        setContent(""); setFile(null); setFileError("");
        if (fileRef.current) fileRef.current.value = "";
        setDraftVersion(version => version + 1);
      }
      return result;
    } catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "发送失败，请重试" }; }
    finally { setPhase(""); }
  }, null);
  return <form action={action} className="message-composer">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
    <label htmlFor={`message-${kind}-${id}`} className="field-label">{kind === "direct" ? "发送私信" : "参与小组讨论"}</label>
    <MarkdownEditor key={draftVersion} id={`message-${kind}-${id}`} value={content} onChange={setContent} required={!file} disabled={pending} maxLength={10000} rows={5} onAttach={() => fileRef.current?.click()} attachmentLabel="上传文件（≤ 10 MB，保留 10 分钟）" attachmentSelected={!!file} />
    <input ref={fileRef} id={`file-${kind}-${id}`} type="file" disabled={pending} hidden onChange={event => {
      const chosen = event.target.files?.[0] ?? null;
      if (chosen && chosen.size > MAX_FILE_BYTES) { setFileError("原始文件不能超过 10 MB"); setFile(null); event.target.value = ""; return; }
      setFileError(""); setFile(chosen);
    }} />
    <div className="editor-attachments">
      <p className="text-xs text-muted mt-2">每次 1 个文件，原始大小 ≤ 10 MB；自动压缩传输，上传后 10 分钟删除。</p>
      {file && <div className="selected-attachment"><span>{file.name} · {formatFileSize(file.size)}</span><IconButton icon="close" label="移除文件" disabled={pending} onClick={() => { setFile(null); setFileError(""); if (fileRef.current) fileRef.current.value = ""; }} /></div>}
      {fileError && <p className="form-error" role="alert">{fileError}</p>}
    </div>
    <ErrorMessage state={state} />
    {phase && <p role="status" className="text-xs text-muted mt-2">{phase}</p>}
    {state?.ok && <p role="status" className="sr-only">消息已发送</p>}
    <div className="composer-actions"><SubmitButton icon="send" pendingText="发送中…">发送消息</SubmitButton></div>
  </form>;
}
export function RefreshMessages() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 8000);
    const visible = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [router]);
  return <IconButton icon="refresh" label="刷新消息" onClick={() => router.refresh()} />;
}
export function ChatRefresh({ kind, id, lastId, markRead = true }: { kind: "direct" | "group"; id: number; lastId: number; markRead?: boolean }) {
  useEffect(() => {
    if (!markRead || !lastId) return;
    const read = () => { if (document.visibilityState === "visible") startTransition(() => { void markChatReadAction(kind, id, lastId); }); };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [kind, id, lastId, markRead]);
  return <RefreshMessages />;
}
