import { getLevel } from "@/lib/titles";

export function TitleBadge({
  customTitle,
  postCount,
}: {
  customTitle?: string | null;
  postCount: number;
}) {
  if (customTitle) {
    return (
      <span className="pill border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
         {customTitle}
      </span>
    );
  }
  const lv = getLevel(postCount);
  return <span className={`pill ${lv.cls}`}>{lv.name}</span>;
}
