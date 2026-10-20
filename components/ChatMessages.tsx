import Link from "next/link";
import { Avatar } from "./Avatar";
import { RichText } from "./RichText";
import { timeAgo } from "@/lib/format";
import type { ChatMessage } from "@/lib/social";
import { AttachmentDownload } from "./AttachmentDownload";
export function ChatMessages({ messages, userId }: { messages: ChatMessage[]; userId: number }) {
  return <ol className="chat-messages" aria-label="消息记录" aria-live="polite">{messages.length ? messages.map(m => <li key={m.id} className={`chat-message ${m.sender_id === userId ? "from-me" : ""}`}>
    <Link href={`/u/${m.username}`} aria-label={m.nickname}><Avatar user={m} size={32} /></Link><div className="chat-message-body"><div className="chat-message-meta"><Link href={`/u/${m.username}`}>{m.nickname}</Link><time dateTime={m.created_at.replace(" ", "T")}>{timeAgo(m.created_at)}</time></div>{m.content && <RichText content={m.content} />}
      {m.attachment_id && (m.attachment ? <AttachmentDownload attachment={m.attachment} /> : <p className="attachment-expired">文件已过期 · 上传后仅保留 10 分钟</p>)}
    </div>
  </li>) : <li className="empty-state"><h3>从一句你好开始</h3><p>这里还没有消息。友善的交流，从你开始。</p></li>}</ol>;
}
