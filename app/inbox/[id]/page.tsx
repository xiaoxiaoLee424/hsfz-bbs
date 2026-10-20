import { hasBlocked, isBlocked } from "@/lib/dm";
import { toggleBlockAction } from "@/app/actions/dm";
import { SubmitButton } from "@/components/SubmitButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { conversationFor, directMessages } from "@/lib/social";
import { Avatar } from "@/components/Avatar";
import { ChatMessages } from "@/components/ChatMessages";
import { MessageComposer, ChatRefresh } from "@/components/SocialForms";
export const metadata = { title: "私信会话", robots: { index: false, follow: false } };
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const conversation = conversationFor(id, user.id);
  if (!conversation) notFound();
  const otherId = conversation.user_low === user.id ? conversation.user_high : conversation.user_low;
  const ownBlock = hasBlocked(user.id, otherId);
  const blocked = isBlocked(user.id, otherId);
  const before = Number((await searchParams).before) || undefined;
  const messages = directMessages(user.id, id, before);
  return <div className="chat-page"><Link href="/inbox" className="back-link">← 全部私信</Link><div className="page-heading"><div className="flex items-center gap-3"><Avatar user={conversation} size={44} /><div><h1>{conversation.nickname}</h1><p>@{conversation.username} · 私人会话</p></div></div><div className="flex shrink-0 items-center gap-2"><form action={toggleBlockAction}><input type="hidden" name="to_id" value={otherId} /><SubmitButton className="btn" icon={ownBlock ? "unlock" : "ban"} active={ownBlock}>{ownBlock ? "取消拉黑" : "拉黑"}</SubmitButton></form><ChatRefresh kind="direct" id={id} lastId={messages.at(-1)?.id || 0} markRead={!before} /></div></div>
    <section className="card chat-sheet" aria-label="私人会话">{messages.length === 50 && <Link className="history-link" href={`/inbox/${id}?before=${messages[0].id}`}>查看更早的消息</Link>}{before && <Link className="history-link" href={`/inbox/${id}`}>回到最新消息</Link>}<ChatMessages messages={messages} userId={user.id} />{!before && (blocked ? <p className="p-5 text-muted">你或对方已拉黑，无法发送私信。</p> : conversation.banned || conversation.status !== "approved" ? <p className="p-5 text-muted">对方当前无法接收私信。</p> : <MessageComposer kind="direct" id={id} />)}</section>
  </div>;
}
