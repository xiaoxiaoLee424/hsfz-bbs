"use client";

export default function ThemeToggle() {
  function toggle() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("hsfz-theme", dark ? "dark" : "light"); } catch {}
  }
  return <button type="button" onClick={toggle} aria-label="切换深色 / 浅色主题" title="切换深色 / 浅色主题" className="theme-toggle"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z" /></svg></button>;
}
