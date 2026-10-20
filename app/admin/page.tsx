import { IconButton } from "@/components/IconAction";
import { ScrollRow } from "@/components/ScrollRow";
import Link from "next/link";
import { db, getSetting } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { TitleBadge } from "@/components/TitleBadge";
import { ConfirmSubmit } from "@/components/SubmitButton";
import { BadgeUploadForm } from "@/components/AdminBadgeForms";
import { AdminResetPasswordForm } from "@/components/AdminResetPassword";
import { WhitelistImportForm } from "@/components/WhitelistForms";
import SiteBadge from "@/components/SiteBadge";
import { timeAgo, ticketCategoryName, TICKET_STATUS } from "@/lib/format";
import { userPostCount } from "@/lib/db";
import {
  approveUserAction,
  rejectUserAction,
  banUserAction,
  unbanUserAction,
  setCustomTitleAction,
  setAdminRoleAction,
  deleteWhitelistAction,
  deleteThreadAction,
  togglePinAction,
  toggleFeatureAction,
  removeBadgeAction,
} from "@/app/actions/admin";
import type { UserRow } from "@/lib/db";

export const metadata = { title: "管理后台" };

type Tab = "users" | "threads" | "tickets" | "site";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const me = await requireAdmin();
  const { tab: rawTab, status } = await searchParams;
  const tab: Tab =
    rawTab === "threads" || rawTab === "tickets" || rawTab === "site" ? rawTab : "users";

  const pendingUsers = db
    .prepare("SELECT * FROM users WHERE status = 'pending' ORDER BY created_at ASC")
    .all() as UserRow[];
  const whitelist = db
    .prepare(
      `SELECT w.*, u.username AS used_username
       FROM whitelist w LEFT JOIN users u ON u.id = w.used_by
       ORDER BY w.id DESC LIMIT 100`
    )
    .all() as Array<{
      id: number; real_name: string; student_id: string; grade: string;
      used_by: number; used_username: string | null;
    }>;
  const allUsers = db
    .prepare("SELECT * FROM users WHERE status != 'pending' ORDER BY id ASC")
    .all() as UserRow[];
  const threads = db
    .prepare(
      `SELECT t.*, b.name AS board_name, u.nickname AS author_name
       FROM threads t JOIN boards b ON b.id = t.board_id JOIN users u ON u.id = t.author_id
       ORDER BY t.created_at DESC LIMIT 50`
    )
    .all() as Array<{ id: number; title: string; board_name: string; author_name: string; reply_count: number; is_pinned: number; is_featured: number; anonymous: number; created_at: string }>;
  const ticketFilter = ["open", "replied", "closed"].includes(status ?? "") ? status! : null;
  const tickets = db
    .prepare(
      `SELECT t.*, u.nickname AS user_nickname FROM tickets t JOIN users u ON u.id = t.user_id
       ${ticketFilter ? "WHERE t.status = ?" : ""}
       ORDER BY t.updated_at DESC LIMIT 100`
    )
    .all(...(ticketFilter ? [ticketFilter] : [])) as Array<{
      id: number; category: string; subject: string; status: string; updated_at: string; user_nickname: string;
    }>;

  const tabLink = ({ name, label, badge }: { name: Tab; label: string; badge?: number }) => (
    <Link
      href={`/admin?tab=${name}`}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
        tab === name ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
      {badge ? (
        <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">管理后台</h1>
        <p className="text-xs text-muted">仅管理员可见</p>
      </div>

      <ScrollRow as="nav" aria-label="管理功能" className="gap-5 border-b border-line">
        {tabLink({ name: "users", label: "用户管理", badge: pendingUsers.length })}
        {tabLink({ name: "threads", label: "帖子管理" })}
        {tabLink({ name: "tickets", label: "工单处理" })}
        {tabLink({ name: "site", label: "站点设置" })}
      </ScrollRow>

      {/* 用户管理 */}
      {tab === "users" && (
        <>
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>待审核注册（{pendingUsers.length}）</span>
            </div>
            {pendingUsers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">暂无待审核的注册申请</p>
            ) : (
              <ul className="divide-y divide-line">
                {pendingUsers.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar user={u} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        {u.nickname} <span className="text-xs text-muted">@{u.username}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {u.grade && `${u.grade} · `}
                        {u.bio || "（无签名）"}
                      </span>
                    </span>
                    <form action={approveUserAction}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <IconButton type="submit" className="btn-xs !border-emerald-500/30 !text-emerald-700 hover:!bg-emerald-500/10 dark:!text-emerald-400" icon="check" label="批准注册" />
                    </form>
                    <form action={rejectUserAction} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input name="reason" className="input !w-36 !py-1 !text-xs" placeholder="驳回理由（可空）" />
                      <ConfirmSubmit icon="close" className="btn-danger" message="确定驳回该注册申请？驳回后该用户将无法登录。">
                        驳回
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>校友名单（免审核注册 · {whitelist.length} 条）</span>
            </div>
            <WhitelistImportForm />
            {whitelist.length > 0 && (
              <ul className="max-h-72 divide-y divide-line overflow-auto border-t border-line">
                {whitelist.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1">
                      <span className="font-medium">{w.real_name}</span>
                      <span className="ml-2 text-xs text-muted">学号 {w.student_id}</span>
                      {w.grade && <span className="ml-2 pill bg-soft text-muted">{w.grade}</span>}
                    </span>
                    {w.used_by ? (
                      <span className="pill bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        已绑定 @{w.used_username}
                      </span>
                    ) : (
                      <span className="pill bg-soft text-muted">未使用</span>
                    )}
                    <form action={deleteWhitelistAction}>
                      <input type="hidden" name="whitelist_id" value={w.id} />
                      <ConfirmSubmit icon="trash" className="btn-danger" message={`确定删除 ${w.real_name} 的名单记录？`}>
                    删除
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-header">重置用户密码（忘记密码的人工通道）</div>
            <AdminResetPasswordForm />
          </div>

          <div className="card">
            <div className="card-header">全部用户（{allUsers.length}）</div>
            <ul className="divide-y divide-line">
              {allUsers.map((u) => {
                const pc = userPostCount(u.id);
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar user={u} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/u/${u.username}`} className="font-medium hover:text-brand hover:underline">
                          {u.nickname}
                        </Link>
                        <span className="text-xs text-muted">@{u.username}</span>
                        {u.grade && <span className="pill bg-soft text-muted">{u.grade}</span>}
                        <TitleBadge customTitle={u.custom_title} postCount={pc} />
                        {u.role === "admin" && <span className="pill bg-brand text-white">管理员</span>}
                        {u.banned === 1 && <span className="pill bg-red-500/10 text-red-700 dark:text-red-400">已封禁</span>}
                      </span>
                      <span className="block text-xs text-muted">发帖 {pc} 条 · 加入于 {u.created_at.slice(0, 10)}</span>
                    </span>
                    <form action={setCustomTitleAction} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input
                        name="custom_title"
                        defaultValue={u.custom_title}
                        placeholder="专属头衔"
                        maxLength={16}
                        className="input !w-32 !py-1 !text-xs"
                      />
                      <IconButton type="submit" icon="award" label="授予头衔" />
                    </form>
                    {u.status === "approved" && u.id !== 1 && u.id !== me.id && (
                      <form action={setAdminRoleAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="make" value={u.role === "admin" ? "user" : "admin"} />
                        {u.role === "admin" ? (
                          <ConfirmSubmit className="btn-xs" message={`确定取消 ${u.nickname} 的管理员身份？`}>
                            取消管理员
                          </ConfirmSubmit>
                        ) : (
                          <ConfirmSubmit className="btn-xs" message={`确定将 ${u.nickname} 设为管理员？其将拥有后台全部权限。`}>
                            设为管理员
                          </ConfirmSubmit>
                        )}
                      </form>
                    )}
                    {u.role !== "admin" && (
                      <form action={u.banned === 1 ? unbanUserAction : banUserAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        {u.banned === 1 ? (
                          <IconButton type="submit" icon="unlock" label="解封用户" />
                        ) : (
                          <ConfirmSubmit icon="ban" className="btn-danger" message={`确定封禁 ${u.nickname}？其会话将被立即踢出。`}>
                            封禁
                          </ConfirmSubmit>
                        )}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {/* 站点设置 */}
      {tab === "site" && (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="card p-4 text-center">
            <p className="mb-3 text-xs font-medium text-muted">当前徽章</p>
            <SiteBadge className="mx-auto h-20 w-20" />
            <p className="mt-3 text-xs text-muted">
              {getSetting("site_badge") ? "已使用自定义徽章" : "默认徽章（管理员可上传替换）"}
            </p>
            {getSetting("site_badge") && (
              <form action={removeBadgeAction} className="mt-3">
                <ConfirmSubmit icon="refresh" className="btn-danger" message="确定恢复为默认徽章？">
                  恢复默认
                </ConfirmSubmit>
              </form>
            )}
          </div>
          <div className="card">
            <div className="card-header">上传站点徽章（学校校徽）</div>
            <BadgeUploadForm />
          </div>
        </div>
      )}

      {/* 帖子管理 */}
      {tab === "threads" && (
        <div className="card">
          <div className="card-header">最近帖子（{threads.length}）</div>
          <ul className="divide-y divide-line">
            {threads.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {t.is_pinned === 1 && (
                      <span className="pill bg-red-500/10 text-red-600 dark:text-red-400">置顶</span>
                    )}
                    {t.is_featured === 1 && (
                      <span className="pill bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">精华</span>
                    )}
                    {t.anonymous === 1 && <span className="pill bg-soft text-muted">匿名</span>}
                    <Link href={`/t/${t.id}`} className="truncate font-medium hover:text-brand hover:underline">
                      {t.title}
                    </Link>
                  </span>
                  <span className="block text-xs text-muted">
                    {t.board_name} · {t.author_name} · {timeAgo(t.created_at)} · {t.reply_count} 回复
                  </span>
                </span>
                <form action={togglePinAction}>
                  <input type="hidden" name="thread_id" value={t.id} />
                  <IconButton type="submit" icon={t.is_pinned ? "pin-off" : "pin"} label={t.is_pinned ? "取消置顶" : "置顶"} active={!!t.is_pinned} />
                </form>
                <form action={toggleFeatureAction}>
                  <input type="hidden" name="thread_id" value={t.id} />
                  <IconButton type="submit" icon="award" label={t.is_featured ? "取消精华" : "加精"} active={!!t.is_featured} />
                </form>
                <form action={deleteThreadAction}>
                  <input type="hidden" name="thread_id" value={t.id} />
                  <ConfirmSubmit icon="trash" className="btn-danger" message="确定删除该帖子及全部回复？此操作不可恢复。">
                    删除
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 工单处理 */}
      {tab === "tickets" && (
        <div className="space-y-3">
          <ScrollRow as="nav" aria-label="工单状态" className="gap-2 text-xs">
            {[
              { key: "", label: "全部" },
              { key: "open", label: "待处理" },
              { key: "replied", label: "已回复" },
              { key: "closed", label: "已关闭" },
            ].map((f) => (
              <Link
                key={f.key}
                href={`/admin?tab=tickets${f.key ? `&status=${f.key}` : ""}`}
                className={`pill ${
                  (status ?? "") === f.key ? "bg-brand text-white" : "border border-line bg-card text-muted hover:bg-soft"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </ScrollRow>
          <div className="card">
            <div className="card-header">工单列表（{tickets.length}）</div>
            {tickets.length === 0 ? (
              <p className="px-4 py-10 text-center text-muted">暂无工单</p>
            ) : (
              <ul className="divide-y divide-line">
                {tickets.map((t) => {
                  const st = TICKET_STATUS[t.status] ?? TICKET_STATUS.open;
                  return (
                    <li key={t.id}>
                      <Link href={`/admin/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-soft/60">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{t.subject}</span>
                          <span className="block text-xs text-muted">
                            {ticketCategoryName(t.category)} · {t.user_nickname} · {timeAgo(t.updated_at)}
                          </span>
                        </span>
                        <span className={`pill shrink-0 ${st.cls}`}>{st.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
