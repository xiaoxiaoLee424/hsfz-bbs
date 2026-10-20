import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { unreadTicketCount, openTicketCount, unreadNotificationCount } from "@/lib/queries";
import { unreadDmCount } from "@/lib/dm";
import { Avatar } from "./Avatar";
import SiteBadge from "./SiteBadge";
import ThemeToggle from "./ThemeToggle";
import { IconSearch } from "./icons";
import { logoutAction } from "@/app/actions/auth";

export default async function Header() {
  const user = await getCurrentUser();
  const unread = user ? unreadTicketCount(user.id) + unreadNotificationCount(user.id) + unreadDmCount(user.id) : 0;
  const openTickets = user?.role === "admin" ? openTicketCount() : 0;

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#1a5276] to-[#148f77] text-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[15px] font-semibold">
          <SiteBadge className="h-8 w-8 drop-shadow-sm" />
          <span>HSFZ BBS</span>
          <span className="hidden text-xs font-normal text-white/70 lg:inline">
            华南师大附中校园论坛
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 text-sm md:flex">
          <Link href="/" className="rounded-md px-2.5 py-1.5 hover:bg-white/15">
            首页
          </Link>
          {user && (
            <Link href="/messages" className="relative rounded-md px-2.5 py-1.5 hover:bg-white/15">
              我的消息
              {unread > 0 && (
                <span className="absolute -right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
          {user?.role === "admin" && (
            <Link href="/admin" className="relative rounded-md px-2.5 py-1.5 hover:bg-white/15">
              管理后台
              {openTickets > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold">
                  {openTickets}
                </span>
              )}
            </Link>
          )}
        </nav>

        <form action="/search" className="ml-auto hidden sm:block">
          <div className="relative">
            <input
              name="q"
              placeholder="搜索帖子…"
              className="h-8 w-40 rounded-md border border-white/20 bg-white/15 pl-3 pr-8 text-sm text-white outline-none transition-all placeholder:text-white/60 focus:w-52 focus:bg-white/25"
            />
            <button
              type="submit"
              aria-label="搜索"
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-white/80 hover:bg-white/20 hover:text-white"
            >
              <IconSearch className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        <ThemeToggle />

        {user ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/new"
              className="hidden rounded-md bg-[#1a7f37] px-3 py-1.5 text-sm font-medium hover:bg-[#1f8f3f] sm:block"
            >
              ✏️ 发帖
            </Link>
            <details className="relative">
              <summary className="flex cursor-pointer list-none rounded-full ring-2 ring-transparent transition hover:ring-white/40">
                <Avatar user={user} size={32} />
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-md border border-line bg-card py-1 text-sm text-ink shadow-lg">
                <div className="border-b border-line px-3 py-2">
                  <p className="font-semibold">{user.nickname}</p>
                </div>
                <Link href={`/u/${user.username}`} className="block px-3 py-2 hover:bg-soft">
                  个人主页
                </Link>
                <Link href="/experimental" className="block px-3 py-2 hover:bg-soft">实验功能</Link>
                <Link href="/settings" className="block px-3 py-2 hover:bg-soft">
                  账号设置
                </Link>
                <Link href="/messages" className="block px-3 py-2 hover:bg-soft">
                  我的消息
                  {unread > 0 && (
                    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {unread}
                    </span>
                  )}
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin" className="block px-3 py-2 hover:bg-soft">
                    管理后台
                  </Link>
                )}
                <form action={logoutAction} className="border-t border-line">
                  <button type="submit" className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-500/10 dark:text-red-400">
                    退出登录
                  </button>
                </form>
              </div>
            </details>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium hover:bg-white/15"
            >
              登录
            </Link>
            <Link href="/register" className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-brand-dark hover:bg-white/90">
              注册
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
