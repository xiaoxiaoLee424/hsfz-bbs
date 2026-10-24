"use client";
import { useEffect, useState } from "react";
export function SelectionToolbar() {
  const [selection, setSelection] = useState<{
    key: string;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const selected = window.getSelection();
      if (
        !selected ||
        selected.isCollapsed ||
        selected.rangeCount !== 1 ||
        !selected.toString().trim()
      ) {
        setSelection(null);
        return;
      }
      const range = selected.getRangeAt(0);
      const element =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement;
      const body = element?.closest<HTMLElement>("[data-quote-body]");
      if (!body || !body.contains(range.endContainer)) {
        setSelection(null);
        return;
      }
      const key = body.dataset.quoteBody!;
      if (!document.querySelector(`[data-quote-enabled="${key}"]`)) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({
        key,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 200)),
        top: Math.max(8, Math.min(rect.top - 44, window.innerHeight - 50)),
      });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);
  if (!selection) return null;
  return (
    <div
      role="toolbar"
      aria-label="选区引用"
      className="fixed z-[100] flex gap-1 rounded border border-line bg-card p-1 shadow-lg"
      style={{ left: selection.left, top: selection.top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="btn"
        onClick={() => {
          document.dispatchEvent(
            new CustomEvent("post-quote", {
              detail: { key: selection.key, copy: false },
            }),
          );
          setSelection(null);
        }}
      >
        插入引用
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          document.dispatchEvent(
            new CustomEvent("post-quote", {
              detail: { key: selection.key, copy: true },
            }),
          )
        }
      >
        复制引用
      </button>
    </div>
  );
}
