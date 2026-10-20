import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HSFZ BBS · 华附论坛",
    template: "%s · HSFZ BBS",
  },
  description: "华南师范大学附属中学校园论坛：学习交流、社团活动、二手交易、失物招领与校园生活分享。",
};

const themeInit = `(function(){try{var t=localStorage.getItem('hsfz-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Header />
        <div className="app-workspace"><main id="main-content" className="app-canvas">{children}</main>
        <footer className="app-footer">
            <p>HSFZ BBS · 把校园里的故事留在这里。</p>
              <Link href="/b/announcements" className="hover:text-brand">
                社区公约
              </Link>
        </footer>
        </div>
      </body>
    </html>
  );
}
