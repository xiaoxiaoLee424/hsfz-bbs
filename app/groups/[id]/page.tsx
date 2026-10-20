import { IconLink } from "@/components/IconAction";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { groupById, groupMessages, groupMembers } from "@/lib/social";
import { Avatar } from "@/components/Avatar";
import { ChatMessages } from "@/components/ChatMessages";
import { MembershipForm, MessageComposer, ChatRefresh } from "@/components/SocialForms";
export const metadata = { title: "小组讨论", robots: { index: false, follow: false } };
export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const user = await getCurrentUser();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const group = groupById(id, user?.id);
  if (!group) notFound();
  const before = Number((await searchParams).before) || undefined;
  const joined = !!group.joined && !!user;
  const messages = joined ? groupMessages(user.id, id, before) : [];
  const members = joined ? groupMembers(user.id, id) : [];
  return <div><Link href="/groups" className="back-link">← 兴趣小组</Link><div className="page-heading"><div><h1>{group.name}</h1><p>{group.member_count} 位成员 · 组长 {group.owner_name}</p></div>{user ? <MembershipForm id={id} joined={joined} owner={group.owner_id === user.id} /> : <IconLink href="/login" className="btn-primary" icon="user-plus" label="登录后加入" />}</div>
    {group.description && <p className="group-description">{group.description}</p>}
    {joined ? <div className="social-split"><section className="card chat-sheet"><div className="card-header"><h2>小组讨论</h2><ChatRefresh kind="group" id={id} lastId={messages.at(-1)?.id || 0} markRead={!before} /></div>{messages.length === 50 && <Link className="history-link" href={`/groups/${id}?before=${messages[0].id}`}>查看更早的消息</Link>}{before && <Link className="history-link" href={`/groups/${id}`}>回到最新消息</Link>}<ChatMessages messages={messages} userId={user.id} />{!before && <MessageComposer kind="group" id={id} />}</section><section className="member-panel"><div className="card-header"><h2>小组成员</h2><span>{members.length}</span></div><ul className="member-list">{members.map(m => <li key={m.id}><Link href={`/u/${m.username}`}><Avatar user={m} size={32} /><span>{m.nickname}<small>@{m.username}</small></span>{m.id === group.owner_id && <small>组长</small>}</Link></li>)}</ul></section></div> : <section className="card empty-state"><h2>先加入，再坐下来聊聊</h2><p>加入小组后，你可以查看讨论、认识成员，并分享自己的想法。</p></section>}
  </div>;
}
