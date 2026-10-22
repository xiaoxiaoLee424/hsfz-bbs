import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { allBoards, hotThreads, siteStats, threadsSorted, announcementThreads, featuredThreads } from "@/lib/queries";
import { activeBanners } from "@/lib/banners";
import { BannerStrip } from "@/components/BannerStrip";
import { CAT_ORDER, CAT_EMOJI, CAT_DESC } from "@/lib/categories";
import { ThreadList } from "@/components/ThreadList";
import { fmtNum } from "@/lib/format";

const SORTS = [
  { key: "latest", label: "最新" },
  { key: "reply", label: "最多回复" },
  { key: "likes", label: "最多点赞" },
  { key: "views", label: "最多浏览" },
];

const GRADS = [
  "bg-gradient-to-br from-[#1a5276] to-[#148f77]",
  "bg-gradient-to-br from-[#5b21b6] to-[#7c3aed]",
  "bg-gradient-to-br from-[#9d174d] to-[#be185d]",
  "bg-gradient-to-br from-[#92400e] to-[#d97706]",
  "bg-gradient-to-br from-[#1e40af] to-[#2563eb]",
  "bg-gradient-to-br from-[#065f46] to-[#059669]",
  "bg-gradient-to-br from-[#7c2d12] to-[#c2410c]",
  "bg-gradient-to-br from-[#334155] to-[#475569]",
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const sort = SORTS.some((s) => s.key === sortParam) ? (sortParam as string) : "latest";
  const user = await getCurrentUser();
  const boards = user ? allBoards() : [];
  const grouped = CAT_ORDER.map((cat) => ({ cat, items: boards.filter((b) => b.category === cat) })).filter(
    (g) => g.items.length
  );
  const threads = user ? threadsSorted(sort, 25) : [];
  const hot = user ? hotThreads(5) : [];
  const featured = featuredThreads(8);
  const announcements = user ? [] : announcementThreads(5);
  const stats = user ? siteStats() : null;
  const banners = activeBanners();

  return (
    <div className="space-y-6">
      {banners.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">📣 校园动态</h2>
            {user ? (
              <Link href="/banner" className="text-xs text-brand hover:underline">
                我也要投稿 →
              </Link>
            ) : (
              <span className="text-xs text-muted">登录后可投稿</span>
            )}
          </div>
          <BannerStrip items={banners} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">🗂️ 板块分类</h2>
          <span className="text-xs text-muted">共 {boards.length} 个板块 · 点击进入分区</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAT_ORDER.map((cat) => {
            const items = boards.filter((b) => b.category === cat);
            return (
              <Link
                key={cat}
                href={`/c/${encodeURIComponent(cat)}`}
                className="card group p-4 transition-colors hover:border-brand"
              >
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold group-hover:text-brand">
                    {CAT_EMOJI[cat]} {cat}
                  </p>
                  <span className="text-xs text-muted">{items.length} 板块</span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted">{CAT_DESC[cat]}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {featured.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">🔥 精选速览</h2>
            <span className="text-xs text-muted">左右滑动查看更多 →</span>
          </div>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {featured.map((t, i) => (
              <Link
                key={t.id}
                href={`/t/${t.id}`}
                className={`w-64 shrink-0 snap-start rounded-lg border-[1.5px] border-line p-4 transition-transform hover:scale-[1.02] ${GRADS[i % GRADS.length]}`}
              >
                <div className="flex items-center gap-2 text-xs text-white/85">
                  <span className="pill bg-white/20 text-white">{t.board_icon} {t.board_name}</span>
                  {t.is_pinned === 1 && <span>置顶</span>}
                  {t.is_featured === 1 && <span>精华</span>}
                </div>
                <p className="mt-2 line-clamp-2 min-h-11 font-semibold text-white">{t.title}</p>
                <p className="mt-2 flex gap-3 text-xs text-white/75">
                  <span>💬 {t.reply_count}</span>
                  <span>❤️ {t.like_count}</span>
                  <span>👁 {t.views}</span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="card min-w-0">
          <div className="card-header flex items-center justify-between">
            <span>🔥 最新动态</span>
            {user ? (
              <Link href="/new" className="btn-primary !px-2.5 !py-1 text-xs">
                ✏️ 发帖
              </Link>
            ) : (
              <Link href="/register" className="link text-xs font-medium">
                注册并审核通过后即可发帖 →
              </Link>
            )}
          </div>
          {user ? (
            <>
              <div className="flex flex-wrap gap-2 border-b-[1.5px] border-line px-4 py-2 text-xs">
                {SORTS.map((s) => (
                  <Link
                    key={s.key}
                    href={`/?sort=${s.key}`}
                    className={`rounded-full px-2.5 py-1 ${
                      sort === s.key ? "bg-brand text-white" : "text-muted hover:bg-soft"
                    }`}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
              <ThreadList threads={threads} />
            </>
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted">
                🔒 论坛内容仅对注册同学开放。登录后可浏览全部帖子与回复。
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Link href="/login" className="btn-primary !px-4 !py-1.5 text-sm">
                  登录
                </Link>
                <Link href="/register" className="btn !px-4 !py-1.5 text-sm">
                  注册
                </Link>
              </div>
              {announcements.length > 0 && (
                <div className="mt-6 text-left">
                  <p className="mb-2 px-4 text-xs font-semibold text-muted">📢 站务公告（游客可见）</p>
                  <ul className="divide-y-[1.5px] divide-line">
                    {announcements.map((t) => (
                      <li key={t.id}>
                        <Link href={`/t/${t.id}`} className="block px-4 py-2.5 text-sm hover:bg-soft/60">
                          📢 {t.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {user && (
          <div className="card">
            <div className="card-header">⚡ 热门话题</div>
            <ol className="divide-y-[1.5px] divide-line">
              {hot.map((t, i) => (
                <li key={t.id} className="flex gap-2 px-3 py-2.5 text-sm">
                  <span className={`w-4 shrink-0 text-center font-semibold ${i < 3 ? "text-[var(--danger)]" : "text-muted"}`}>
                    {i + 1}
                  </span>
                  <Link href={`/t/${t.id}`} className="line-clamp-2 flex-1 hover:text-brand hover:underline">
                    {t.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          )}

          {stats && <div className="card">
            <div className="card-header">📊 站点统计</div>
            <dl className="grid grid-cols-2 gap-y-3 p-4 text-sm">
              <dt className="text-muted">注册同学</dt>
              <dd className="text-right font-semibold">{fmtNum(stats.users)}</dd>
              <dt className="text-muted">主题帖子</dt>
              <dd className="text-right font-semibold">{fmtNum(stats.threads)}</dd>
              <dt className="text-muted">回复总数</dt>
              <dd className="text-right font-semibold">{fmtNum(stats.replies)}</dd>
              <dt className="text-muted">24 小时新帖</dt>
              <dd className="text-right font-semibold">{fmtNum(stats.recent)}</dd>
            </dl>
          </div>}

          <div className="card p-4 text-center">
            <p className="text-sm font-medium tracking-[0.3em] text-ink">进德修业</p>
            <p className="mt-1 text-sm font-medium tracking-[0.3em] text-ink">格物致知</p>
            <p className="mt-2 text-xs text-muted">华南师范大学附属中学</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
