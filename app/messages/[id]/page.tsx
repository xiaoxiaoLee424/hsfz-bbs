import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";
import { replyTicketAction } from "@/app/actions/profile";
import { timeAgo, ticketCategoryName, TICKET_STATUS, nowStr } from "@/lib/format";

export const metadata = { title: "工单详情" };

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isInteger(tid) || tid <= 0) notFound();

  const ticket = db
    .prepare("SELECT * FROM tickets WHERE id = ? AND user_id = ?")
    .get(tid, user.id) as
    | { id: number; category: string; subject: string; status: string; created_at: string }
    | undefined;
  if (!ticket) notFound();

  // 打开即标记已读
  db.prepare("UPDATE tickets SET user_read_at = ? WHERE id = ?").run(nowStr(), tid);

  const messages = db
    .prepare(
      `SELECT m.*, u.nickname, u.username, u.avatar, u.role
       FROM ticket_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = ? ORDER BY m.created_at ASC`
    )
    .all(tid) as Array<{
      id: number; is_admin: number; content: string; created_at: string;
      nickname: string; username: string; avatar: string; role: string;
    }>;

  const st = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.open;
  const closed = ticket.status === "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav className="text-xs text-muted">
        <Link href="/messages" className="hover:text-brand">
          ← 返回我的消息
        </Link>
      </nav>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{ticket.subject}</h1>
          <span className={`pill ${st.cls}`}>{st.label}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {ticketCategoryName(ticket.category)} · 发起于 {timeAgo(ticket.created_at)}
          {closed && " · 工单已关闭，如仍有问题请新建工单"}
        </p>
      </div>

      <div className="card">
        <div className="card-header">对话记录</div>
        <ul className="divide-y divide-line">
          {messages.map((m) => (
            <li key={m.id} className="flex gap-3 px-4 py-3">
              <Avatar user={m} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="text-sm font-semibold text-ink">
                    {m.role === "admin" ? "BBS 站务组" : m.nickname}
                  </span>
                  {m.is_admin === 1 && <span className="pill bg-brand text-white">管理员</span>}
                  <span>{timeAgo(m.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{m.content}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {closed ? (
        <div className="card p-4 text-center text-sm text-muted">工单已关闭，如仍有问题请返回列表新建工单。</div>
      ) : (
        <form action={replyTicketAction} className="card p-4">
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <label className="mb-1.5 block text-sm font-medium">补充回复</label>
          <textarea name="content" required rows={3} className="input resize-y" placeholder="继续补充信息或追问…" />
          <div className="mt-3 flex justify-end">
            <SubmitButton icon="send">发送</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
