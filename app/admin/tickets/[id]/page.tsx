import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { SubmitButton, ConfirmSubmit } from "@/components/SubmitButton";
import {
  adminReplyTicketAction,
  closeTicketAction,
  grantTitleAction,
} from "@/app/actions/profile";
import { timeAgo, ticketCategoryName, TICKET_STATUS } from "@/lib/format";

export const metadata = { title: "处理工单" };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isInteger(tid) || tid <= 0) notFound();

  const ticket = db
    .prepare(
      `SELECT t.*, u.nickname AS user_nickname, u.username AS user_username, u.avatar AS user_avatar,
              u.custom_title AS user_custom_title
       FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`
    )
    .get(tid) as
    | {
        id: number; user_id: number; category: string; subject: string; status: string;
        created_at: string; user_nickname: string; user_username: string; user_avatar: string; user_custom_title: string;
      }
    | undefined;
  if (!ticket) notFound();

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
        <Link href="/admin?tab=tickets" className="hover:text-brand">
          ← 返回工单列表
        </Link>
      </nav>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{ticket.subject}</h1>
          <span className={`pill ${st.cls}`}>{st.label}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {ticketCategoryName(ticket.category)} · 发起人{" "}
          <Link href={`/u/${ticket.user_username}`} className="link">
            {ticket.user_nickname}
          </Link>{" "}
          · {timeAgo(ticket.created_at)}
          {ticket.user_custom_title && (
            <>
              {" "}
              · 当前头衔：<span className="text-amber-600"> {ticket.user_custom_title}</span>
            </>
          )}
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
                    {m.role === "admin" ? "BBS 站务组（我）" : m.nickname}
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
        <div className="card p-4 text-center text-sm text-muted">该工单已关闭。</div>
      ) : (
        <>
          {ticket.category === "title_request" && (
            <form action={grantTitleAction} className="card border-amber-500/30 p-4">
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <label className="mb-1.5 block text-sm font-medium">
                一键授予头衔（授予后会自动回复对方并标记为已处理）
              </label>
              <div className="flex gap-2">
                <input
                  name="title"
                  required
                  maxLength={16}
                  className="input flex-1"
                  placeholder="输入要授予的头衔，如：篮球社新人王"
                />
                <SubmitButton className="btn-primary shrink-0">授予并回复</SubmitButton>
              </div>
            </form>
          )}

          <form action={adminReplyTicketAction} className="card p-4">
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <label className="mb-1.5 block text-sm font-medium">以站务组身份回复</label>
            <textarea name="content" required rows={3} className="input resize-y" placeholder="回复该同学…" />
            <div className="mt-3 flex justify-end">
              <SubmitButton className="btn-primary">回复并标记已处理</SubmitButton>
            </div>
          </form>

          {!closed && (
            <form action={closeTicketAction} className="flex justify-end">
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <ConfirmSubmit className="btn" message="确定不回复直接关闭该工单？">
                关闭工单（不回复）
              </ConfirmSubmit>
            </form>
          )}
        </>
      )}
    </div>
  );
}
