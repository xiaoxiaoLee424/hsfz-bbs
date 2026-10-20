import { IconLink } from "@/components/IconAction";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { boardBySlug, boardThreads } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { ThreadList } from "@/components/ThreadList";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const board = boardBySlug(slug);
  return { title: board ? `${board.name}` : "板块" };
}

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // 游客仅可查看站务公告板块，其余内容需登录
  if (slug !== "announcements" && !(await getCurrentUser())) redirect("/login");
  const board = boardBySlug(slug);
  if (!board) notFound();
  const threads = boardThreads(board.id);
  const user = await getCurrentUser();
  const canPost =
    !board.grade_lock || user?.role === "admin" || user?.grade === board.grade_lock;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">
                {board.name}
              </h1>
              {board.grade_lock && (
                <span className="pill bg-soft text-muted">年级群 · 仅限{board.grade_lock}同学发言</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">{board.description}</p>
            <p className="mt-1 text-xs text-muted">{threads.length} 个主题</p>
          </div>
          {user ? (
            canPost ? (
              <IconLink href={`/new?board=${board.slug}`} className="btn-primary" icon="compose" label="发帖" />
            ) : (
              <span className="shrink-0 text-xs text-muted">
                你当前是{user.grade || "未填写年级"}，仅可浏览；可在
                <Link href="/settings" className="link">
                  账号设置
                </Link>
                中确认年级
              </span>
            )
          ) : (
            <IconLink href="/login" icon="login" label="登录后发帖" />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">全部主题</div>
        <ThreadList threads={threads} showBoard={false} />
      </div>
    </div>
  );
}
