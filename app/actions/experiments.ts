"use server";
import { requireUser } from "@/lib/auth";
import { setRecommendationsEnabled } from "@/lib/experiments";
import { revalidatePath } from "next/cache";
export async function toggleRecommendationsAction(form:FormData) {
  const user=await requireUser();
  const value=form.get("enabled");
  if(value!=="1"&&value!=="0")return;
  setRecommendationsEnabled(user.id,value==="1");
  revalidatePath("/","layout");
}
