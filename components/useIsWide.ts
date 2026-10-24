"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(callback: () => void) {
  const media = matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** Composer 断点：SSR 返回 true（桌面默认双栏），移动端由 CSS 媒体查询先行兜底，无水合闪烁。 */
export function useIsWide() {
  return useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => true);
}
