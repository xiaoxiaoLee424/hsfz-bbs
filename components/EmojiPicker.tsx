"use client";
import { useCallback } from "react";
import { EmojiPopover } from "./EmojiPopover";
export function EmojiPicker({
  targetRef,
  onChange,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}) {
  const select = useCallback(
    ({ code }: { key: string; code: string }) => {
      const el = targetRef.current;
      if (!el) return;
      // 统一插入 :short_code: 文本：标准与自定义表情同一形态，渲染层共用一套词典
      const start = el.selectionStart,
        end = el.selectionEnd;
      onChange(el.value.slice(0, start) + code + el.value.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + code.length, start + code.length);
      });
    },
    [targetRef, onChange],
  );
  return <EmojiPopover onSelect={select} />;
}
