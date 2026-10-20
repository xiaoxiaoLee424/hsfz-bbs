"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EMOJIS =
  "😀 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😍 🥰 😘 😜 🤪 🤔 🤨 🧐 🤓 😎 🥳 😏 😌 😔 😪 😭 😢 😱 🥺 🤗 🤫 🤭 😇 🙄 😴 😷 🤒 🤕 🤧 🥵 🥶 🤯 😤 👍 👎 👏 🙌 🤝 💪 🙏 👀 💯 🔥 ✨ 🎉 🎓 📚 ✏️ 📝 ❤️ 💚 💙 💜 🖤 ⭐ 🌙".split( // taste-skill-ignore: user-authored content choices, not UI decoration.
    " "
  );

/** Floating above the editor keeps the picker usable inside clipped cards. */
export function EmojiPicker({ onPick, disabled = false }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setPosition(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setPosition(null); buttonRef.current?.focus(); }
    };
    const reposition = () => setPosition(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [position]);
  return <>
    <button ref={buttonRef} type="button" className="editor-tool" title="插入表情" aria-label="插入表情" aria-expanded={!!position} aria-haspopup="dialog" disabled={disabled}
      onClick={() => {
        if (position) { setPosition(null); return; }
        const rect = buttonRef.current!.getBoundingClientRect();
        setPosition({ top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 300)), left: Math.max(8, Math.min(rect.left, window.innerWidth - 312)) });
      }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 14c2 3 6 3 8 0M8 9h.01M16 9h.01" /></svg>
    </button>
    {position && createPortal(<div ref={menuRef} role="dialog" aria-label="选择表情" className="editor-emoji-menu" style={position} onKeyDown={event => {
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
      if (!(event.key in moves) && event.key !== "Home" && event.key !== "End") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + moves[event.key] + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    }}>
      {EMOJIS.map(emoji => <button key={emoji} type="button" aria-label={`插入 ${emoji}`} onClick={() => { onPick(emoji); setPosition(null); }}>{emoji}</button>)}
    </div>, document.body)}
  </>;
}
