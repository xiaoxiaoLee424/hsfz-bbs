import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CreateGroupForm } from "@/components/SocialForms";
export const metadata = { title: "创建小组" };
export default async function NewGroupPage() {
  await requireUser();
  return <div className="form-page"><Link href="/groups" className="back-link">← 兴趣小组</Link><div className="page-heading"><div><h1>创建小组</h1><p>一个兴趣，一群同路人。</p></div></div><section className="card p-6"><CreateGroupForm /></section></div>;
}
