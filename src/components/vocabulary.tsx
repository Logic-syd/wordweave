"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Heart, NotebookPen, Search } from "lucide-react";
import type { VocabularyView, UserWord } from "@/lib/types";
import { WordCard, statusLabels } from "./word-card";
export function Vocabulary({ initial }: { initial: VocabularyView[] }) {
  const [words, setWords] = useState(initial);
  const [language, setLanguage] = useState("all");
  const [status, setStatus] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VocabularyView | null>(null);
  const filtered = words.filter(
    (w) =>
      (language === "all" || w.language === language) &&
      (status === "all" || w.user?.status === status) &&
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
          <h1>让想学的词，再见一面。</h1>
          <p className="page-subtitle">连同它出现过的句子，一起记住。</p>
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
                  <span>在文章中遇见 {w.user?.exposureCount ?? 0} 次</span>
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
                      <Link href={`/read/${a.articleId}#${a.sourceId}`}>
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
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <NotebookPen size={32} />
          <h3>{favorites ? "还没有收藏的词" : "这里还没有符合条件的词"}</h3>
          <p>读文章时点击外语表达，收藏或选择“想学”。</p>
          <Link href="/library" className="button primary">
            去读一篇
          </Link>
        </div>
      )}
      <p className="vocabulary-footnote">
        “遇见”只记录文章覆盖。只有你主动选择“认识”或“想学”，才会改变复习安排。
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
