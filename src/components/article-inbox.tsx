"use client";
import { ui } from "@/lib/ui";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, FilePlus2 } from "lucide-react";
import { browserData, localReviewWords } from "@/lib/browser-store";
import { browserAiReady } from "@/lib/browser-ai";
import { settingsSchema, type Settings } from "@/lib/schemas";
import { useBrowserAi } from "./browser-ai-settings";
import { NewForm } from "./new-form";

function InboxForm({ mode }: { mode: "tech" | "german" }) {
  const config = useBrowserAi();
  const [data, setData] = useState<{ settings: Settings; due: string[] }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      browserData(false, (d) => d.preferences[mode === "tech" ? "en" : "de"]),
      localReviewWords(),
    ])
      .then(([preference, due]) => {
        if (live)
          setData({
            settings: settingsSchema.parse(preference?.settings ?? {}),
            due: due.map((w) => w.lemma),
          });
      })
      .catch(() => {
        if (live) setError(ui("无法读取导入设置，请检查浏览器存储权限。"));
      });
    return () => {
      live = false;
    };
  }, [mode]);
  if (!data)
    return (
      <p role={error ? "alert" : "status"}>
        {error || ui("正在读取导入设置…")}
      </p>
    );
  return (
    <NewForm
      mode={mode}
      configured={browserAiReady(config)}
      initialSettings={data.settings}
      dueWords={data.due}
      browserLocal
      embedded
    />
  );
}

export function ArticleInbox({
  mode: initialMode,
  expanded,
  onExpandedChange,
  daily = false,
  children,
}: {
  mode: "tech" | "german";
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  daily?: boolean;
  children: ReactNode;
}) {
  const [mode, setMode] = useState(initialMode);
  const router = useRouter();
  function changeMode(next: "tech" | "german") {
    if (next === mode) return;
    setMode(next);
    if (daily)
      router.push(next === "german" ? "/read?lang=de" : "/read", {
        scroll: false,
      });
  }
  return (
    <aside className="reading-inbox" aria-label="文章导入与阅读设置">
      <button
        type="button"
        className="inbox-toggle"
        aria-label="导入文章与阅读设置"
        aria-expanded={expanded}
        aria-controls="reading-inbox-body"
        onClick={() => onExpandedChange(!expanded)}
      >
        <FilePlus2 size={18} />
        <span>{ui("导入文章与阅读设置")}</span>
        <ChevronDown size={17} />
      </button>
      <div
        id="reading-inbox-body"
        className={`inbox-body study-panel${expanded ? " is-open" : ""}`}
      >
        <div className="inbox-heading reading-inbox-heading">
          <h2 aria-label={ui("文章收件箱")}>
            <span>文章收件箱</span>
            <small lang="en">Article inbox</small>
          </h2>
          <Link href="/library" aria-label={ui("我的文章 →")}>
            <span>
              我的文章<small lang="en">My articles</small>
            </span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="segmented inbox-modes" aria-label={ui("文章语言")}>
          <button
            type="button"
            aria-label={ui("英语")}
            aria-pressed={mode === "tech"}
            className={mode === "tech" ? "selected" : ""}
            onClick={() => changeMode("tech")}
          >
            <span>英语</span>
            <small lang="en">English</small>
          </button>
          <button
            type="button"
            aria-label={ui("德语")}
            aria-pressed={mode === "german"}
            className={mode === "german" ? "selected" : ""}
            onClick={() => changeMode("german")}
          >
            <span>德语</span>
            <small lang="en">German</small>
          </button>
        </div>
        <InboxForm key={mode} mode={mode} />
        <section className="inbox-reading-options">
          <h3>{ui("阅读设置")}</h3>
          {children}
        </section>
      </div>
    </aside>
  );
}
