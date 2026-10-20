export const LEVELS = [
  { min: 100, name: "传奇学长", cls: "bg-soft text-muted" },
  { min: 50, name: "校园达人", cls: "bg-soft text-muted" },
  { min: 20, name: "活跃同学", cls: "bg-soft text-muted" },
  { min: 5, name: "校园新人", cls: "bg-soft text-muted" },
  { min: 0, name: "新入校", cls: "bg-soft text-muted" },
];

export function getLevel(postCount: number) {
  return LEVELS.find((l) => postCount >= l.min) ?? LEVELS[LEVELS.length - 1];
}
