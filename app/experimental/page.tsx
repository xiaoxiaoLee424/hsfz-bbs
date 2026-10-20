import { requireUser } from "@/lib/auth";
import { recommendationsEnabled } from "@/lib/experiments";
import { toggleRecommendationsAction } from "@/app/actions/experiments";
import { ExperimentToggle } from "@/components/ExperimentToggle";
export const metadata={title:"实验功能"};
export default async function ExperimentalPage() {
  const user=await requireUser();
  const enabled=recommendationsEnabled(user.id);
  return <div className="mx-auto max-w-3xl space-y-5">
    <div className="space-y-2"><div><h1 className="text-xl font-semibold">实验功能</h1><p>选择想要试用的功能，随时可以关闭。</p></div></div>
    <section className="card p-5" aria-labelledby="recommendation-experiment">
      <div className="flex items-start justify-between gap-5"><div className="min-w-0"><h2 id="recommendation-experiment" className="font-semibold">为你推荐</h2><p className="mt-2 text-sm text-muted leading-6">根据阅读、互动和感兴趣的板块，为你发现更多校园讨论。</p></div>
        <form action={toggleRecommendationsAction} className="shrink-0"><input type="hidden" name="enabled" value={enabled?"0":"1"} /><ExperimentToggle enabled={enabled} /></form>
      </div>
      <p className="mt-4 text-sm">{enabled?"已启用":"未启用"}<span className="text-muted"> · 此设置随账号保存。</span></p>
      <p className="mt-2 text-sm text-muted leading-6">兴趣档案保存在此设备。启用后，首次发帖会下载推荐组件并在本机生成推荐特征；关闭后将恢复普通讨论列表，停止推荐记录和模型加载。</p>
    </section>
  </div>;
}
