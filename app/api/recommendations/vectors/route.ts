import { recommendationsEnabled } from "@/lib/experiments";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { boundedJson, sameOrigin } from "@/lib/recommendation/http";
import { MODEL_VERSION } from "@/lib/recommendation/config";
import { parseEmbedding, saveEmbedding } from "@/lib/recommendation/store";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({error:"请先登录"},{status:401});
  if (!recommendationsEnabled(user.id)) return Response.json({error:"请先启用实验推荐"},{status:403});
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after)||after<0) return Response.json({error:"Invalid cursor"},{status:400});
  const posts = db.prepare(`SELECT t.id,t.title,substr(t.content,1,6000) AS content FROM threads t
    LEFT JOIN post_vectors p ON p.post_id=t.id AND p.model_version=?
    WHERE t.author_id=? AND t.id>? AND p.post_id IS NULL ORDER BY t.id LIMIT 8`).all(MODEL_VERSION,user.id,after);
  return Response.json({version:MODEL_VERSION,posts},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({error:"请先登录"},{status:401});
  if (!recommendationsEnabled(user.id)) return Response.json({error:"请先启用实验推荐"},{status:403});
  if (!sameOrigin(request)) return Response.json({error:"Invalid origin"},{status:403});
  try {
    const body = await boundedJson(request,24000) as {postId:number;vector:string;version:string};
    if (!Number.isSafeInteger(body.postId)||body.postId<=0) throw new Error("Invalid post");
    const value = parseEmbedding(body.vector,body.version);
    if (!value) throw new Error("Missing vector");
    const saved = db.transaction(() => {
      if (!db.prepare("SELECT 1 FROM threads WHERE id=? AND author_id=?").get(body.postId,user.id)) return false;
      saveEmbedding(db,body.postId,value); return true;
    })();
    if (!saved) return Response.json({error:"无权修改该帖子"},{status:403});
    return Response.json({ok:true,compatible:value.compatible});
  } catch { return Response.json({error:"Invalid vector"},{status:400}); }
}
