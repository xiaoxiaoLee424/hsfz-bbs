import { IconLink } from "@/components/IconAction";
import Link from "next/link";
import { allBoards } from "@/lib/queries";
export const metadata = { title: "全部板块" };
const ORDER = ["学习成长", "年级群", "生活娱乐", "球友", "游戏", "交易互助", "情感联结", "官方"];
export default function BoardsPage() {
  const boards = allBoards();
  return <div><div className="page-heading"><div><h1>全部板块</h1><p>{boards.length} 个话题空间，总有一个属于你。</p></div><IconLink href="/new" className="btn-primary" icon="compose" label="发布帖子" /></div>
    <div className="board-directory">{ORDER.map(cat => <section className="board-category" key={cat}><h2>{cat}</h2><div>{boards.filter(b => b.category === cat).map(b => <Link className="board-directory-row" key={b.id} href={`/b/${b.slug}`}><span><b>{b.name}</b><small>{b.description}</small></span><span className="board-count">{b.thread_count} <small>主题</small></span><span aria-hidden="true">↗</span></Link>)}</div></section>)}</div>
  </div>;
}
