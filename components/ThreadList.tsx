import Link from "next/link";
import type { ThreadRow } from "@/lib/queries";
import { timeAgo, fmtNum } from "@/lib/format";
import { IconComment, IconEye, IconHeart } from "./icons";

function threadImages(t: ThreadRow): string[] {
  try {
    const parsed: unknown = t.images ? JSON.parse(t.images) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function imageCount(t: ThreadRow): number {
  return threadImages(t).length;
}

export function ThreadList({
  threads,
  showBoard = true,
}: {
  threads: ThreadRow[];
  showBoard?: boolean;
}) {
  if (!threads.length) {
    return (
      <div className="px-4 py-12 text-center text-muted">
        这里还没有帖子，来发第一帖吧～
      </div>
    );
  }
  return (
    <div className="divide-y-[1.5px] divide-line">
      {threads.map((t) => (
        <ThreadRowItem key={t.id} t={t} showBoard={showBoard} />
      ))}
    </div>
  );
}

export function ThreadRowItem({
  t,
  showBoard = true,
}: {
  t: ThreadRow;
  showBoard?: boolean;
}) {
  const images = threadImages(t);
  return (
    <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-soft/60">
      <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        {t.is_pinned === 1 && (
          <span className="pill shrink-0 bg-red-500/10 text-red-600 dark:text-red-400">置顶</span>
        )}
        {t.is_featured === 1 && (
          <span className="pill shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">精华</span>
        )}
        {t.visibility && t.visibility !== "public" && (
          <span className="pill shrink-0 bg-soft text-muted" title="仅自己/关注者可见">
            🔒
          </span>
        )}
        <Link
          href={`/t/${t.id}`}
          className="min-w-0 truncate font-medium text-ink hover:text-brand hover:underline"
        >
          {t.title}
        </Link>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {showBoard && (
          <Link
            href={`/b/${t.slug}`}
            className="pill bg-brand/10 text-brand hover:bg-brand hover:text-white"
          >
            {t.board_icon} {t.board_name}
          </Link>
        )}
        {t.anonymous === 1 ? (
          <span className="inline-flex items-center gap-1">
            <span className="pill bg-soft text-muted">匿名</span>
            匿名同学
          </span>
        ) : (
          <>
            <Link href={`/u/${t.author_username}`} className="hover:text-brand hover:underline">
              {t.author_name}
            </Link>
            {t.author_title && <span className="text-amber-600 dark:text-amber-400">🏅 {t.author_title}</span>}
          </>
        )}
        <span>{timeAgo(t.created_at)}</span>
        <span className="inline-flex items-center gap-1">
          <IconEye /> {fmtNum(t.views)}
        </span>
        <span className="inline-flex items-center gap-1">
          <IconComment /> {t.reply_count}
        </span>
        <span className="inline-flex items-center gap-1">
          <IconHeart /> {t.like_count}
        </span>
        {imageCount(t) > 0 && <span>🖼️ {imageCount(t)}图</span>}
      </div>
      </div>
      {images.length > 0 && (
        <Link href={`/t/${t.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]}
            alt=""
            loading="lazy"
            className="h-14 w-14 rounded-md border-[1.5px] border-line object-cover"
          />
        </Link>
      )}
    </div>
  );
}
