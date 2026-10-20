"use client";
import { ActionIcon } from "./ActionIcon";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNav({ links }: { links: { href: string; label: string; icon: string; count?: number }[] }) {
  const pathname = usePathname();
  return <nav className="sidebar-nav" aria-label="主导航">{links.map(link => {
    const active = link.href === "/" ? pathname === "/" || pathname.startsWith("/t/") : pathname.startsWith(link.href);
    return <Link key={link.href} href={link.href} className={`nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={link.icon} /></svg>
      <span>{link.label}</span>{!!link.count && <span className="nav-count">{link.count}</span>}
    </Link>;
  })}</nav>;
}

export function MobileMenu({ children }: { children: React.ReactNode }) {
  return <details className="mobile-menu" onClick={event => {
    if ((event.target as HTMLElement).closest("a, button[type=submit]")) event.currentTarget.open = false;
  }}><summary aria-label="打开导航" title="打开导航" className="icon-button"><ActionIcon name="menu" /></summary><div className="mobile-menu-body">{children}</div></details>;
}
