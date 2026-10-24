import { requireAdmin } from "@/lib/auth";
import { emojis } from "@/lib/forum-features";
import { EmojiAdmin } from "@/components/EmojiAdmin";
export default async function Page() {
  await requireAdmin();
  return (
    <div className="card p-4">
      <h1 className="mb-4 text-lg">自定义表情管理</h1>
      <EmojiAdmin initial={emojis()} />
    </div>
  );
}
