import { IconButton } from "@/components/IconAction";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { searchThreads } from "@/lib/queries";
import { ThreadList } from "@/components/ThreadList";

export const metadata = { title: "搜索" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? searchThreads(query) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">搜索</h1>
      <form action="/search" className="card flex gap-2 p-3">
        <input
          name="q"
          defaultValue={query}
          className="input flex-1"
          placeholder="搜索帖子标题与正文…"
          autoFocus
        />
        <IconButton type="submit" className="btn-primary" icon="search" label="搜索帖子" />
      </form>

      {query && (
        <div className="card">
          <div className="card-header">
            「{query}」的搜索结果：{results.length} 条
          </div>
          <ThreadList threads={results} />
        </div>
      )}
    </div>
  );
}
