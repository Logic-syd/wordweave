"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Heart,
  Headphones,
  Mic2,
  NotebookPen,
  Search,
} from "lucide-react";
import type { VocabularyView, UserWord } from "@/lib/types";
import { WordCard, statusLabels } from "./word-card";
import { sampleVocabulary } from "@/lib/sample-storage";
import { browserFetch } from "@/lib/browser-api";
export function Vocabulary({ initial }: { initial: VocabularyView[] }) {
  const [words, setWords] = useState(initial);
  const [language, setLanguage] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VocabularyView | null>(null);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await browserFetch("/api/vocabulary", { cache: "no-store" });
        const personal = response.ok ? await response.json() : null;
        if (!disposed)
          setWords((previous) => [
            ...(Array.isArray(personal)
              ? personal
              : previous.filter((w) => !w.id.startsWith("sample-"))),
            ...sampleVocabulary().filter((w) => w.user),
          ]);
      } catch {
        /* Keep the current list when offline. */
      }
    };
    void refresh();
    window.addEventListener("wordweave:vocabulary", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("wordweave:vocabulary", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const filtered = words.filter(
    (w) =>
      (language === "all" || w.language === language) &&
      (status === "all" || w.user?.status === status) &&
      (source === "all" ||
        w.appearances.some((a) => (a.skill ?? "read") === source)) &&
      (!favorites || w.user?.favorite) &&
      `${w.lemma} ${w.meaning}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const due = words.filter(
    (w) =>
      w.language === "de" &&
      ["LEARNING", "KNOWN"].includes(w.user?.status ?? "") &&
      w.user?.dueAt &&
      new Date(w.user.dueAt) <= new Date(),
  );
  function update(user: UserWord) {
    if (!selected) return;
    setWords((prev) =>
      prev.map((w) => (w.id === selected.id ? { ...w, user } : w)),
    );
    setSelected((prev) => (prev ? { ...prev, user } : null));
  }
  return (
    <main className="page vocabulary-page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">WORDS WORTH KEEPING</span>
          <h1>听说读，共用一个单词库。</h1>
          <p className="page-subtitle">
            连同出现过的句子一起记住，再拿去听一遍、说一次。
          </p>
        </div>
        <span className="word-count">
          {words.length}
          <small>个语境词条</small>
        </span>
      </div>
      {due.length > 0 && (
        <div className="review-invitation">
          <span>
            有 <strong>{due.length}</strong> 个德语词等着在新故事里与你重逢。
          </span>
          <Link href="/new?mode=german">
            读一篇复习故事 <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      <div className="collection-toolbar">
        <div className="filter-tabs">
          {[
            ["all", "全部语言"],
            ["en", "英语"],
            ["de", "德语"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={language === v ? "selected" : ""}
              onClick={() => setLanguage(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索词条"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索词语或含义…"
          />
        </label>
      </div>
      <div className="vocabulary-filters">
        <label>
          遇见它的地方
          <select
            aria-label="词条来源筛选"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">全部来源</option>
            <option value="listen">听力</option>
            <option value="speak">口语</option>
            <option value="read">阅读</option>
          </select>
        </label>
        <label>
          学习状态
          <select
            aria-label="学习状态筛选"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`chip favorite-filter ${favorites ? "selected" : ""}`}
          aria-pressed={favorites}
          onClick={() => setFavorites(!favorites)}
        >
          <Heart size={15} fill={favorites ? "currentColor" : "none"} />
          只看收藏
        </button>
      </div>
      {filtered.length ? (
        <div className="vocabulary-list">
          {filtered.map((w) => (
            <div className="vocabulary-row" key={w.id}>
              <button
                className="vocabulary-word"
                onClick={() => setSelected(w)}
              >
                <div className="vocabulary-word-top">
                  <span
                    className={`language-tag ${w.language === "de" ? "sage" : "rose"}`}
                  >
                    {w.language === "de" ? "DE" : "EN"}
                  </span>
                  <h2>
                    {w.language === "de" && w.grammar.article ? (
                      <span className="article-gender">
                        {w.grammar.article}{" "}
                      </span>
                    ) : null}
                    {w.lemma}
                  </h2>
                  {w.user?.favorite && (
                    <Heart
                      size={15}
                      className="favorite-heart"
                      fill="currentColor"
                    />
                  )}
                </div>
                <p>{w.meaning}</p>
                <div className="word-row-meta">
                  <span className={`status-tag status-${w.user?.status}`}>
                    {statusLabels[w.user?.status ?? "NEW"]}
                  </span>
                  <span>遇见 {w.user?.exposureCount ?? 0} 次</span>
                  {[
                    ...new Set(w.appearances.map((a) => a.skill ?? "read")),
                  ].map((skill) => (
                    <span
                      key={skill}
                      className="word-source-badge"
                      data-skill={skill}
                    >
                      {skill === "listen"
                        ? "听力"
                        : skill === "speak"
                          ? "口语"
                          : "阅读"}
                    </span>
                  ))}
                  {w.user?.dueAt && (
                    <span>
                      {new Date(w.user.dueAt) <= new Date()
                        ? "待复习"
                        : `下次 ${new Date(w.user.dueAt).toLocaleDateString("zh-CN")}`}
                    </span>
                  )}
                </div>
              </button>
              <details className="appearance-details">
                <summary>
                  出现过的语境 <span>{w.appearances.length}</span>
                </summary>
                {w.appearances.length ? (
                  w.appearances.map((a, i) => (
                    <div className="appearance" key={`${a.articleId}-${i}`}>
                      <Link
                        href={a.href ?? `/read/${a.articleId}#${a.sourceId}`}
                      >
                        <span
                          className="word-source-badge"
                          data-skill={a.skill ?? "read"}
                        >
                          {a.skill === "listen"
                            ? "听力"
                            : a.skill === "speak"
                              ? "口语"
                              : "阅读"}
                        </span>
                        {a.title}
                        <ArrowUpRight size={14} />
                      </Link>
                      <p lang={w.language}>{a.sentence}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    原文章已删除。你保存的词义、例句和学习记录仍然保留。
                  </p>
                )}
              </details>
              <div className="word-practice-actions">
                <Link href={`/listen?word=${encodeURIComponent(w.id)}`}>
                  <Headphones size={14} />
                  听这个词
                </Link>
                <Link href={`/speak?word=${encodeURIComponent(w.id)}`}>
                  <Mic2 size={14} />
                  用它说一句
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <NotebookPen size={32} />
          <h3>{favorites ? "还没有收藏的词" : "这里还没有符合条件的词"}</h3>
          <p>听力、口语和阅读中收藏的表达，都会来到这里。</p>
          <Link href="/library" className="button primary">
            去读一篇
          </Link>
        </div>
      )}
      <p className="vocabulary-footnote">
        “遇见”记录阅读和练习中的语境。只有你主动收藏或选择学习状态，才会改变复习安排。
      </p>
      {selected && (
        <WordCard
          word={selected}
          onClose={() => setSelected(null)}
          onUpdate={update}
        />
      )}
    </main>
  );
}
