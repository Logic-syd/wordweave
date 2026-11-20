"use client";
import { ui } from "@/lib/ui";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, FilePlus2 } from "lucide-react";
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
  children,
}: {
  mode: "tech" | "german";
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}) {
  const [mode, setMode] = useState(initialMode);
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
        className={`inbox-body${expanded ? " is-open" : ""}`}
      >
        <div className="inbox-heading">
          <h2>{ui("文章收件箱")}</h2>
          <Link href="/library">{ui("我的文章 →")}</Link>
        </div>
        <div className="segmented inbox-modes" aria-label="导入语言">
          <button
            type="button"
            aria-pressed={mode === "tech"}
            className={mode === "tech" ? "selected" : ""}
            onClick={() => setMode("tech")}
          >
            {ui("英语")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "german"}
            className={mode === "german" ? "selected" : ""}
            onClick={() => setMode("german")}
          >
            {ui("德语")}
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
