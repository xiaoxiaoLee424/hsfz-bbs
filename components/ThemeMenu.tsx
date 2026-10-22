"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const PRESETS = [
  { key: "teal", label: "原版青绿", icon: "🟢" },
  { key: "blue", label: "蔚蓝", icon: "🔵" },
  { key: "discourse", label: "清爽", icon: "⚪" },
  { key: "dark", label: "深色", icon: "🌙" },
];

// 当前主题属于「外部状态」（写在 <html data-theme> 上，由 layout 里的启动脚本和本组件共同维护），
// 用 useSyncExternalStore 读取，避免在 effect 里 setState 造成级联渲染。
const THEME_CHANGE_EVENT = "hsfz-theme-change";

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function readTheme() {
  return document.documentElement.getAttribute("data-theme") || "teal";
}

// 服务端渲染读不到 DOM，先按默认主题输出，水合后再切到真实值。
function readServerTheme() {
  return "teal";
}

export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const current = useSyncExternalStore(subscribeTheme, readTheme, readServerTheme);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function apply(key: string) {
    const root = document.documentElement;
    root.classList.toggle("dark", key === "dark");
    root.setAttribute("data-theme", key);
    try {
      localStorage.setItem("hsfz-theme-preset", key);
    } catch {
      /* 忽略 */
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    setOpen(false);
  }

  const active = PRESETS.find((p) => p.key === current) ?? PRESETS[0];
  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label="选择主题"
        title={"主题：" + active.label}
        className="flex h-8 cursor-pointer items-center justify-center rounded-md text-base text-white/90 hover:bg-white/15"
        onClick={() => setOpen(!open)}
      >
        🎨
      </button>
      {open && (
        <div className="popover absolute right-0 z-50 mt-1 w-44 rounded-md border border-line bg-card p-1 shadow-lg">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => apply(p.key)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-soft ${
                current === p.key ? "font-semibold text-brand" : "text-ink"
              }`}
            >
              <span>{p.icon}</span>
              {p.label}
              {current === p.key && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
