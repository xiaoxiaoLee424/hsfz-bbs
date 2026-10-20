import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { SocialError, startConversation } from "@/lib/social";

/** Legacy conversation links resolve to the shared, authorized rich-message screen. */
export default async function LegacyConversationPage({ params }: { params: Promise<{ username: string }> }) {
  const user = await requireUser();
  const { username } = await params;
  let id: number;
  try {
    id = startConversation(user.id, username.trim().toLowerCase());
  } catch (error) {
    if (error instanceof SocialError) notFound();
    throw error;
  }
  redirect(`/inbox/${id}`);
}
