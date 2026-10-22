import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { userBanners } from "@/lib/banners";
import { BannerForm } from "@/components/BannerForm";
import { ConfirmSubmit } from "@/components/SubmitButton";
import { deleteMyBannerAction } from "@/app/actions/banners";
import { BANNER_STATUS_LABEL, bannerVisual } from "@/lib/banner-presets";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "投稿横幅" };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  offline: "bg-soft text-muted",
};

export default async function BannerPage() {
  const user = await requireUser();
  const mine = userBanners(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">📣 投稿横幅</h1>
        <p className="mt-1 text-sm text-muted">
          社团招新、比赛组队、失物招领、活动预告……都可以做成一条小横幅挂在首页顶部。
          提交后由管理员审核，通过后自动上线滚动。
        </p>
      </div>

      <div className="card">
        <div className="card-header">✍️ 新建投稿</div>
        <BannerForm />
      </div>

      <div className="card">
        <div className="card-header">我的投稿（{mine.length}）</div>
        {mine.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">还没有投过稿，试试上面那条？</p>
        ) : (
          <ul className="divide-y-[1.5px] divide-line">
            {mine.map((b) => {
              const { style } = bannerVisual(b.bg_kind, b.bg_value);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    style={style}
                    className="h-11 w-[150px] shrink-0 rounded-md ring-1 ring-white/10"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{b.title}</span>
                      <span className={`pill ${STATUS_STYLE[b.status] ?? "bg-soft text-muted"}`}>
                        {BANNER_STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {timeAgo(b.created_at)}
                      {b.text ? ` · ${b.text}` : ""}
                      {b.link ? ` · 跳转 ${b.link}` : ""}
                    </span>
                    {b.status === "rejected" && b.reject_reason && (
                      <span className="mt-0.5 block text-xs text-red-600 dark:text-red-400">
                        未通过原因：{b.reject_reason}
                      </span>
                    )}
                  </span>
                  {b.status !== "approved" && (
                    <form action={deleteMyBannerAction}>
                      <input type="hidden" name="banner_id" value={b.id} />
                      <ConfirmSubmit className="btn-xs" message="删除这条投稿？">
                        删除
                      </ConfirmSubmit>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-muted">
        想看看效果？<Link href="/" className="link">回首页</Link>
      </p>
    </div>
  );
}
