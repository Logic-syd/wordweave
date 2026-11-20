"use client";
import { ui } from "@/lib/ui";

/* eslint-disable @next/next/no-html-link-for-pages -- Read Along is a standalone document; navigation to it must load HTML. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BookOpen,
  Headphones,
  Mic2,
  NotebookPen,
  Puzzle,
  KeyRound,
  Ellipsis,
  Library,
} from "lucide-react";
import { rememberSkill } from "@/lib/learning-entry";
import { SpriteIcon } from "./sprite-icon";
const nav = [
  {
    href: "/listen",
    label: "听力",
    english: "Listen",
    skill: "listen",
    icon: Headphones,
  },
  {
    href: "/speak",
    label: "口语",
    english: "Speak",
    skill: "speak",
    icon: Mic2,
  },
  {
    href: "/read",
    label: "阅读",
    english: "Read",
    skill: "read",
    icon: BookOpen,
  },
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const skill = nav.find(
      (item) => path === item.href || path.startsWith(item.href + "/"),
    )?.skill;
    if (skill) rememberSkill(skill);
    if (menu.current) menu.current.open = false;
  }, [path]);
  if (path === "/login") return <>{children}</>;
  const active = (href: string) =>
    href === "/read"
      ? path === "/" ||
        path.startsWith("/read") ||
        path.startsWith("/library") ||
        path.startsWith("/new")
      : path.startsWith(href);
  return (
    <div
      className={`app learning-shell direct-learning${path === "/" || path.startsWith("/read") ? " reading-app" : ""}`}
    >
      <header className="platform-header">
        <div className="platform-header-inner">
          <a href="/" className="platform-brand" aria-label="语境 · 继续学习">
            <span className="platform-brand-icon">
              <SpriteIcon size={27} />
            </span>
            <span>
              语境<small>WordWeave</small>
            </span>
          </a>
          <div className="platform-controls">
            <nav className="platform-nav study-nav" aria-label="听说读导航">
              {nav.map(({ href, label, english, skill, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  data-skill={skill}
                  className={active(href) ? "active" : ""}
                  aria-current={active(href) ? "page" : undefined}
                >
                  <Icon size={16} />
                  <span>
                    <strong>{label}</strong> <small lang="en">{english}</small>
                  </span>
                </a>
              ))}
            </nav>
            <details
              className="platform-more"
              ref={menu}
              onKeyDown={(e) => {
                if (e.key === "Escape" && menu.current) {
                  menu.current.open = false;
                  menu.current.querySelector("summary")?.focus();
                }
              }}
            >
              <summary aria-label="更多功能">
                <Ellipsis size={21} />
              </summary>
              <div
                className="platform-menu"
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                <Link href="/vocabulary">
                  <NotebookPen size={17} />
                  {ui("单词库")}
                </Link>
                <Link href="/library">
                  <Library size={17} />
                  我的库 / My library
                </Link>
                <Link href="/settings">
                  <KeyRound size={17} />
                  {ui("我的 API")}
                </Link>
                <Link href="/extension">
                  <Puzzle size={17} />
                  {ui("浏览器插件")}
                </Link>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="main-shell">{children}</div>
      <footer className="platform-footer">
        <span>{ui("语境 · 每次一点")}</span>
        <Link href="/vocabulary">{ui("单词库")}</Link>
      </footer>
    </div>
  );
}
