"use client";

import type { FocusEvent, HTMLAttributes } from "react";

/** Keep keyboard-focused controls fully visible without moving the surrounding page. */
export function ScrollRow({ as: Tag = "div", className = "", onFocusCapture, ...props }: HTMLAttributes<HTMLElement> & { as?: "div" | "nav" }) {
  function reveal(event: FocusEvent<HTMLElement>) {
    const row = event.currentTarget;
    const target = event.target;
    if (target instanceof HTMLElement && target !== row) {
      const area = row.getBoundingClientRect(), control = target.getBoundingClientRect();
      if (control.right > area.right) row.scrollLeft += control.right - area.right + 4;
      else if (control.left < area.left) row.scrollLeft -= area.left - control.left + 4;
    }
    onFocusCapture?.(event);
  }
  return <Tag {...props} className={`scroll-row ${className}`} onFocusCapture={reveal} />;
}
