"use client";
import { ui } from "@/lib/ui";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
import type { LibraryArticle } from "@/lib/types";
import { ArticleCard } from "./article-card";
import { browserFetch } from "@/lib/browser-api";
export function Library({
  initial,
  initialMode = "all",
}: {
  initial: LibraryArticle[];
  initialMode?: string;
}) {
  const [articles, setArticles] = useState(initial);
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = articles.filter(
    (a) =>
      (mode === "all" || a.mode === mode) &&
      a.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await (id.startsWith("local-article-") ? browserFetch : fetch)(
        `/api/articles/${id}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error((await r.json()).error);
      setArticles((prev) => prev.filter((a) => a.id !== id));
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui("删除失败"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">YOUR READING SHELF</span>
          <h1>{ui("每一篇，都是新的语境。")}</h1>
          <p className="page-subtitle">
            {ui("范文直接读。自己的文章、收藏和进度只保存在这个浏览器。")}
          </p>
        </div>
        <Link href="/new?mode=tech" className="button primary">
          <Plus size={17} />
          {ui("添加文章")}
        </Link>
      </div>
      <div className="collection-toolbar">
        <div className="filter-tabs">
          {[
            ["all", ui("全部文章")],
            ["tech", ui("技术英语")],
            ["german", ui("德语日常")],
          ].map(([v, l]) => (
            <button
              key={v}
              className={mode === v ? "selected" : ""}
              onClick={() => setMode(v)}
            >
              {l}
              <span>
                {articles.filter((a) => v === "all" || a.mode === v).length}
              </span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索文章"
            placeholder={ui("找一篇文章…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {filtered.length ? (
        <div className="library-grid">
          {filtered.map((a) => (
            <div className="library-item" key={a.id}>
              <ArticleCard article={a} />
              <div className="library-item-footer">
                <span>
                  {a.progress?.completed
                    ? ui("已读完")
                    : a.progress?.paragraphId
                      ? ui("阅读中")
                      : ui("未开始")}{" "}
                  · {new Date(a.createdAt).toLocaleDateString("zh-CN")}
                </span>
                {!a.id.startsWith("sample-") && (
                  <button
                    className="icon-button"
                    aria-label={`删除文章：${a.title}`}
                    onClick={() => setConfirm(a.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {confirm === a.id && (
                <div className="inline-confirm">
                  <strong>{ui("删除这篇文章？")}</strong>
                  <p>
                    {ui(
                      "阅读进度和文章关联将删除；收藏的词与主动学习记录会保留。",
                    )}
                  </p>
                  <div>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setConfirm(null)}
                    >
                      {ui("取消")}
                    </button>
                    <button
                      className="button danger"
                      disabled={busy}
                      onClick={() => void remove(a.id)}
                    >
                      {busy ? ui("正在删除…") : ui("确认删除")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={32} />
          <h3>{query ? ui("没有找到这篇文章") : ui("书架还空着")}</h3>
          <p>{ui("换个关键词，或者开始一篇新的阅读。")}</p>
          <Link
            href={`/new?mode=${mode === "german" ? "german" : "tech"}`}
            className="button primary"
          >
            {ui("开始一篇新阅读")}
          </Link>
        </div>
      )}
    </main>
  );
}
