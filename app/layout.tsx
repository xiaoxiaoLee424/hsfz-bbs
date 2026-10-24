import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import Header from "@/components/Header";
import "katex/dist/katex.min.css";
import "./stylesheet/color_definitions.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HSFZ BBS · 华附论坛",
    template: "%s · HSFZ BBS",
  },
  description: "华南师范大学附属中学校园论坛：学习交流、社团活动、二手交易、失物招领与校园生活分享。",
};

const themeInit = `(function(){try{
  var p = localStorage.getItem('hsfz-theme-preset') || localStorage.getItem('hsfz-theme') || 'teal';
  if (p === 'light') p = 'teal';
  if (p === 'dark') document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', p);
}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="mt-8 border-t-[1.5px] border-line bg-card">
          <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted">
            <p className="mb-1 text-sm font-medium tracking-widest text-ink">
              进德修业 · 格物致知
            </p>
            <p>
              HSFZ BBS — 华南师范大学附属中学校园论坛 ·{" "}
              <Link href="/b/announcements" className="hover:text-brand">
                社区公约
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
