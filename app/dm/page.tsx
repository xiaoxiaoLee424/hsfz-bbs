import { redirect } from "next/navigation";

/** Preserve bookmarks from the upstream inbox. */
export default function LegacyInboxPage() {
  redirect("/inbox");
}
