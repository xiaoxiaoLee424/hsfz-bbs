"use server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toggleBlock } from "@/lib/dm";
import { revalidatePath } from "next/cache";

export async function toggleBlockAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const targetId = Number(formData.get("to_id"));
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === user.id) return;
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(targetId)) return;
  toggleBlock(user.id, targetId);
  revalidatePath("/inbox", "layout");
  revalidatePath("/", "layout");
}
