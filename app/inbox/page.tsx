import { IconLink } from "@/components/IconAction";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { conversations } from "@/lib/social";
import { Avatar } from "@/components/Avatar";
import { StartConversationForm, RefreshMessages } from "@/components/SocialForms";
import { timeAgo } from "@/lib/format";
export const metadata = { title: "私信" };
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const user = await requireUser();
  const { to } = await searchParams;
  const chats = conversations(user.id);
  return <div><div className="page-heading"><div><h1>私信</h1><p>有些话，留给彼此。只有会话双方可以阅读。</p></div><div className="flex gap-2"><IconLink href="/groups" icon="group-plus" label="兴趣小组" /><IconLink href="/messages" icon="bell" label="通知与工单" /></div></div>
    <div className="social-split inbox-layout"><section className="card"><div className="card-header"><h2>全部会话</h2><RefreshMessages /></div>{chats.length ? <ul className="conversation-list">{chats.map(c => <li key={c.id}><Link href={`/inbox/${c.id}`}><Avatar user={c} size={40} /><span className="conversation-copy"><b>{c.nickname}</b><small>{c.preview || "会话已创建，发送第一条消息吧。"}</small></span><span className="conversation-tail"><time>{timeAgo(c.updated_at)}</time>{c.unread > 0 && <b className="unread-count">{c.unread} 条未读</b>}</span></Link></li>)}</ul> : <div className="empty-state"><h2>还没有私信</h2><p>输入同学的用户名，开始一场对话。</p></div>}</section>
    <section className="inbox-compose"><h2 className="section-title mb-4">发起私信</h2><StartConversationForm username={to} /></section></div>
  </div>;
}
