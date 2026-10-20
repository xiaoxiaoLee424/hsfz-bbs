import { recommendationsEnabled } from "@/lib/experiments";
import { getCurrentUser } from "@/lib/auth";
import { boundedJson, sameOrigin } from "@/lib/recommendation/http";
import { recordViews } from "@/lib/recommendation/server";
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({error:"请先登录"},{status:401});
  if (!recommendationsEnabled(user.id)) return Response.json({error:"请先启用实验推荐"},{status:403});
  if (!sameOrigin(request)) return Response.json({error:"Invalid origin"},{status:403});
  try {
    const body = await boundedJson(request) as {postIds?:unknown};
    if (!Array.isArray(body.postIds) || body.postIds.length>20 || body.postIds.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error("Invalid events");
    // Strong signals come from authoritative SQL triggers, never fabricated browser events.
    recordViews(user.id,[...new Set(body.postIds)]);
    return Response.json({ok:true});
  } catch { return Response.json({error:"Invalid feedback"},{status:400}); }
}
