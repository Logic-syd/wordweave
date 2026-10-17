"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/login/login.module.css";
import {
  BookOpen,
  Library,
  NotebookPen,
  ArrowUpRight,
  Layers,
  Puzzle,
  LogOut,
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
  const login = path === "/login";
  const [session, setSession] = useState<{
    authenticated: boolean;
    enabled: boolean;
    ownerId?: string;
  } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutPending = useRef(false);

  useEffect(() => {
    if (login) return;
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) setSession(await response.json());
      })
      .catch(() => {
        /* The page handles access errors; no user content is fetched here. */
      });
    return () => controller.abort();
  }, [login]);

  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error("logout failed");
      // A document navigation clears the previous user's in-memory page state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch {
      setLogoutError("退出失败，请检查网络后重试。");
      logoutPending.current = false;
      setLoggingOut(false);
    }
  }

  if (login) return <>{children}</>;
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
        {session?.enabled && session.authenticated && (
          <div className={styles.sessionBar}>
            {session.ownerId && (
              <span className={styles.sessionOwner} title={session.ownerId}>
                当前空间：{session.ownerId}
              </span>
            )}
            <button
              type="button"
              className={styles.logout}
              onClick={logout}
              disabled={loggingOut}
            >
              <LogOut size={14} aria-hidden="true" />
              {loggingOut ? "正在退出…" : "退出登录"}
            </button>
            {logoutError && (
              <p className={styles.logoutError} role="alert">
                {logoutError}
              </p>
            )}
          </div>
        )}
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
