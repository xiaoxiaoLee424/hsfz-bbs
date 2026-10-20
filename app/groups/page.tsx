import { IconButton, IconLink } from "@/components/IconAction";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { groups } from "@/lib/social";
export const metadata = { title: "兴趣小组" };
export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ scope?: string; q?: string }> }) {
  const user = await getCurrentUser();
  const { scope, q = "" } = await searchParams;
  const all = groups(user?.id);
  const mine = all.filter(g => g.joined);
  const list = (scope === "mine" ? mine : all).filter(g => `${g.name} ${g.description}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <div><div className="page-heading"><div><h1>兴趣小组</h1><p>共同的兴趣，让华附再小一点。</p></div><IconLink href={user ? "/groups/new" : "/login"} className="btn-primary" icon="group-plus" label="创建小组" /></div>
    <div className="group-filter-counts"><Link href="/groups" className={scope !== "mine" ? "selected" : ""}><span>发现小组</span><b>{all.length}</b></Link><Link href="/groups?scope=mine" className={scope === "mine" ? "selected" : ""}><span>我加入的</span><b>{mine.length}</b></Link></div>
    <form className="group-search" action="/groups"><label htmlFor="group-search" className="sr-only">搜索小组</label><input className="input" id="group-search" name="q" defaultValue={q} placeholder="搜索小组名称或兴趣…" />{scope === "mine" && <input type="hidden" name="scope" value="mine" />}<IconButton className="btn" type="submit" icon="search" label="搜索小组" /></form>
    <section className="card"><div className="card-header"><h2>{scope === "mine" ? "我加入的小组" : "所有小组"}</h2><span>{list.length} 个小组</span></div>{list.length ? <ul className="group-list">{list.map(g => <li key={g.id}><Link href={`/groups/${g.id}`}><span className="group-monogram" aria-hidden="true">{g.name.slice(0, 1)}</span><span className="group-copy"><b>{g.name}</b><p>{g.description || "欢迎每一位有共同兴趣的同学。"}</p><small>{g.member_count} 位成员 · {g.message_count} 条讨论 · 组长 {g.owner_name}</small></span><span className="group-tail">{g.unread > 0 ? <b className="unread-count">{g.unread} 条未读</b> : g.joined ? "已加入" : "了解小组"}<span aria-hidden="true">↗</span></span></Link></li>)}</ul> : <div className="empty-state"><h2>{q ? "没有找到匹配的小组" : scope === "mine" ? "还没有加入小组" : "等你发起第一个小组"}</h2><p>{q ? "试试其他关键词，或发起属于自己的小组。" : "从球场到图书馆，把共同的兴趣聚在一起。"}</p><Link href={scope === "mine" ? "/groups" : "/groups/new"} className="link">{scope === "mine" ? "发现小组" : "创建小组"} ↗</Link></div>}</section>
  </div>;
}
