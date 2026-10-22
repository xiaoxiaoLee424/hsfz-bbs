import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { unreadTicketCount, openTicketCount, unreadNotificationCount } from "@/lib/queries";
import { unreadDmCount } from "@/lib/dm";
import { Avatar } from "./Avatar";
import SiteBadge from "./SiteBadge";
import ThemeMenu from "./ThemeMenu";
import { IconSearch } from "./icons";
import { logoutAction } from "@/app/actions/auth";

export default async function Header() {
  const user = await getCurrentUser();
  const unread = user ? unreadTicketCount(user.id) + unreadNotificationCount(user.id) + unreadDmCount(user.id) : 0;
  const openTickets = user?.role === "admin" ? openTicketCount() : 0;

  return (
    <header className="sticky top-0 z-40 border-b-[1.5px] border-line bg-header shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[15px] font-semibold text-ink">
          <SiteBadge className="h-8 w-8" />
          <span>HSFZ BBS</span>
          <span className="hidden text-xs font-normal text-muted lg:inline">
            华南师大附中校园论坛
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 text-sm md:flex">
          <Link href="/" className="rounded-md px-2.5 py-1.5 text-ink hover:bg-soft">
            首页
          </Link>
          {user && (
            <Link href="/messages" className="relative rounded-md px-2.5 py-1.5 text-ink hover:bg-soft">
              我的消息
              {unread > 0 && (
                <span className="absolute -right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
          {user && (
            <Link href="/banner" className="rounded-md px-2.5 py-1.5 text-ink hover:bg-soft">
              投稿
            </Link>
          )}
          {user?.role === "admin" && (
            <Link href="/admin" className="relative rounded-md px-2.5 py-1.5 text-ink hover:bg-soft">
              管理后台
              {openTickets > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
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
              className="header-search h-8 w-40 rounded-md border-[1.5px] border-line bg-input pl-3 pr-8 text-sm text-ink outline-none transition-all placeholder:text-muted/60 focus:w-52"
            />
            <button
              type="submit"
              aria-label="搜索"
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted hover:bg-soft hover:text-ink"
            >
              <IconSearch className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        <ThemeMenu />

        {user ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/new"
              className="hidden rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark sm:block"
            >
              ✏️ 发帖
            </Link>
            <details className="relative">
              <summary className="flex cursor-pointer list-none rounded-full ring-2 ring-transparent transition hover:ring-brand/40">
                <Avatar user={user} size={32} />
              </summary>
              <div className="popover absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-md border-[1.5px] border-line bg-card py-1 text-sm text-ink shadow-lg">
                <div className="border-b-[1.5px] border-line px-3 py-2">
                  <p className="font-semibold">{user.nickname}</p>
                </div>
                <Link href={`/u/${user.username}`} className="block px-3 py-2 hover:bg-soft">
                  个人主页
                </Link>
                <Link href="/settings" className="block px-3 py-2 hover:bg-soft">
                  账号设置
                </Link>
                <Link href="/banner" className="block px-3 py-2 hover:bg-soft">
                  投稿横幅
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
                <form action={logoutAction} className="border-t-[1.5px] border-line">
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
              className="rounded-md border-[1.5px] border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-soft"
            >
              登录
            </Link>
            <Link href="/register" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              注册
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
