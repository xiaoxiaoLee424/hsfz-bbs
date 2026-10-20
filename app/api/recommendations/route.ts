import { recommendationsEnabled } from "@/lib/experiments";
import { getCurrentUser } from "@/lib/auth";
import { candidatePool, similarityEdges } from "@/lib/recommendation/server";
import { MODEL_VERSION, RECENT_LIMIT } from "@/lib/recommendation/config";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const user=await getCurrentUser();
  if (!user) return Response.json({error:"请先登录"},{status:401});
  if (!recommendationsEnabled(user.id)) return Response.json({error:"请先启用实验推荐"},{status:403});
  const selected = new URL(request.url).searchParams.get("ids");
  if (selected !== null) {
    const ids = [...new Set(selected.split(",").filter(Boolean).map(Number))];
    if (selected.length>4500 || !ids.length || ids.length>300 || ids.some(id=>!Number.isSafeInteger(id)||id<=0))
      return Response.json({error:"Invalid candidates"},{status:400});
    return Response.json({version:MODEL_VERSION,candidates:candidatePool(ids),edges:[]},
      {headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
  }
  const raw = new URL(request.url).searchParams.get("recent") ?? "";
  if (raw.length>1500) return Response.json({error:"Too many seeds"},{status:400});
  const ids = [...new Set(raw.split(",").filter(Boolean).map(Number))];
  if (ids.length>RECENT_LIMIT || ids.some(id=>!Number.isSafeInteger(id)||id<=0)) return Response.json({error:"Invalid seeds"},{status:400});
  return Response.json({version:MODEL_VERSION,candidates:candidatePool(),edges:similarityEdges(ids)},
    {headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
}
