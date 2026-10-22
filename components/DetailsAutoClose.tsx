"use client";

import { useEffect, useRef } from "react";

/**
 * 原生 <details> 下拉菜单：点击页面其它地方自动收起。
 * 否则菜单浮层会一直盖在内容上，点下面的按钮像“按不动”。
 */
export function DetailsAutoClose({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(event.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
