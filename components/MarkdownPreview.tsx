"use client";

import { useEffect, useState } from "react";
import { RichText } from "./RichText";

/** 编辑器实时预览（客户端渲染；@提及在正式发布后才会转链接） */
export function MarkdownPreview({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const [emojis, setEmojis] = useState([]);
  useEffect(() => {
    fetch("/api/emojis")
      .then((r) => {
        if (r.ok) return r.json();
        throw new Error("表情加载失败");
      })
      .then(setEmojis)
      .catch(console.error);
  }, []);
  return (
    <RichText
      emojis={emojis}
      content={content || "*（暂无内容）*"}
      className={className}
    />
  );
}
