"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Library,
  NotebookPen,
  ArrowUpRight,
  Layers,
  Puzzle,
} from "lucide-react";
const nav = [
  { href: "/", label: "开始阅读", icon: BookOpen },
  { href: "/library", label: "文章库", icon: Library },
  { href: "/vocabulary", label: "生词本", icon: NotebookPen },
  { href: "/extension", label: "浏览器插件", icon: Puzzle },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const reading = path.startsWith("/read/");
  return (
    <div className={reading ? "app reading-app" : "app"}>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Layers size={21} />
          </span>
          <span>
            语境<small>WORDS IN CONTEXT</small>
          </span>
        </Link>
        <div className="nav-label">你的学习空间</div>
        <nav>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                (href === "/" ? path === "/" : path.startsWith(href))
                  ? "active"
                  : ""
              }
            >
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-dot" />
          一点一点，读懂更多。<p>让语言回到故事里。</p>
        </div>
        <Link className="new-article-link" href="/new?mode=tech">
          添加一篇文章 <ArrowUpRight size={17} />
        </Link>
      </aside>
      <div className="main-shell">
        <header className="mobile-header">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Layers size={18} />
            </span>
            语境
          </Link>
          <span className="eyebrow">在语境里，慢慢学会</span>
        </header>
        {children}
      </div>
      <nav className="mobile-nav" aria-label="主导航">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className={
              (href === "/" ? path === "/" : path.startsWith(href))
                ? "active"
                : ""
            }
          >
            <Icon size={19} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
