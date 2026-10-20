import { recommendationsEnabled } from "@/lib/experiments";
import { RecommendedFeed } from "@/components/recommendation/RecommendedFeed";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { allBoards, latestThreads, hotThreads, siteStats, threadsSorted, announcementThreads } from "@/lib/queries";
import { ThreadList } from "@/components/ThreadList";
import { fmtNum } from "@/lib/format";

const CAT_ORDER = ["学习成长", "年级群", "生活娱乐", "球友", "游戏", "交易互助", "情感联结", "官方"];
const CAT_EMOJI: Record<string, string> = {
  学习成长: "📖",
  年级群: "🎓",
  生活娱乐: "🎨",
  球友: "🏀",
  游戏: "🎮",
  交易互助: "🤝",
  情感联结: "💚",
  官方: "📢",
};

const SORTS = [
  { key: "latest", label: "最新" },
  { key: "reply", label: "最多回复" },
  { key: "likes", label: "最多点赞" },
  { key: "views", label: "最多浏览" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortParam } = await searchParams;
  const user = await getCurrentUser();
  const enabled = !!user && recommendationsEnabled(user.id);
  const sorts = [...(enabled ? [{key:"recommended",label:"为你推荐"}] : []), ...SORTS];
  const sort = sorts.some(s=>s.key===sortParam) ? sortParam! : enabled ? "recommended" : "latest";
  const boards = allBoards();
  const grouped = CAT_ORDER.map((cat) => ({ cat, items: boards.filter((b) => b.category === cat) })).filter(
    (g) => g.items.length
  );
  const threads = threadsSorted(sort, 25);
  const hot = hotThreads(5);
  const announcements = user ? [] : announcementThreads(5);
  const stats = siteStats();

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">板块导航</h2>
          <span className="text-xs text-muted">共 {boards.length} 个板块</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {grouped.map(({ cat, items }) => (
            <div key={cat} className="card p-3">
              <p className="mb-2 text-xs font-semibold text-muted">
                {CAT_EMOJI[cat]} {cat}
              </p>
              <ul className="space-y-1.5">
                {items.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/b/${b.slug}`}
                      className="group flex items-center justify-between gap-1 text-sm"
                      title={b.description}
                    >
                      <span className="truncate group-hover:text-brand group-hover:underline">
                        {b.icon} {b.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{b.thread_count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="card">
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
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap border-b border-line px-4 py-2 text-xs">
                {sorts.map((s) => (
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
              {enabled && user && sort === "recommended" ? <RecommendedFeed userId={user.id} boards={boards.map(({id,name})=>({id,name}))} fallback={<ThreadList threads={threads} />} /> : <ThreadList threads={threads} />}
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
                  <ul className="divide-y divide-line">
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
            <ol className="divide-y divide-line">
              {hot.map((t, i) => (
                <li key={t.id} className="flex gap-2 px-3 py-2.5 text-sm">
                  <span className={`w-4 shrink-0 text-center font-semibold ${i < 3 ? "text-[#d1242f]" : "text-muted"}`}>
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

          <div className="card">
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
          </div>

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
