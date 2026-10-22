export type Visibility = "public" | "followers" | "private";

export const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string; hint: string }> = [
  { value: "public", label: "所有人可见", hint: "和以前一样，所有登录同学都能看到" },
  { value: "followers", label: "仅关注者可见", hint: "只有关注了你的人能看到" },
  { value: "private", label: "仅自己可见", hint: "当作私人日记，只有你自己能看到" },
];

export const VISIBILITY_LABEL: Record<string, string> = {
  public: "所有人",
  followers: "仅关注者",
  private: "仅自己",
};

export function normalizeVisibility(value: unknown): Visibility {
  return value === "followers" || value === "private" ? value : "public";
}

/** 判断某条内容对当前访问者是否可见。 */
export function canViewVisibility(
  visibility: string,
  authorId: number,
  viewer: { id: number; role?: string } | null,
  followedAuthorIds?: Set<number>
): boolean {
  if (visibility === "public") return true;
  if (!viewer) return false;
  if (viewer.id === authorId || viewer.role === "admin") return true;
  if (visibility === "followers") return followedAuthorIds?.has(authorId) ?? false;
  return false;
}
