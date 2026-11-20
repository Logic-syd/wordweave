"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  lessonHref,
  lessonKey,
  removeSavedLesson,
  savedLessons,
  type SavedLesson,
} from "@/lib/saved-lessons";
const labels = {
  listen: "听力 / Listen",
  speak: "口语 / Speak",
  read: "阅读 / Read",
};
export function SavedLessons() {
  const [items, setItems] = useState<SavedLesson[]>([]),
    [filter, setFilter] = useState("all"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void savedLessons()
        .then((v) => {
          if (live) setItems(v);
        })
        .catch(() => {
          if (live) setError("无法读取收藏 / Unable to load your library");
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    };
    refresh();
    window.addEventListener("wordweave:local-data", refresh);
    return () => {
      live = false;
      window.removeEventListener("wordweave:local-data", refresh);
    };
  }, []);
  const shown = items.filter(
    (item) => filter === "all" || item.skill === filter,
  );
  return (
    <section className="page saved-lessons" aria-label="我的听说读收藏">
      <h1>我的库 / My library</h1>
      <p>
        主动保存的听力、口语和阅读。没保存也可以直接学。 / Your saved listening,
        speaking and reading. Saving is optional.
      </p>
      <div className="filter-tabs">
        {Object.entries({ all: "全部 / All", ...labels }).map(
          ([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ),
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">正在读取 / Loading…</p>
      ) : shown.length ? (
        <div className="saved-lesson-grid">
          {shown.map((item) => (
            <article key={lessonKey(item)} className="saved-lesson-card">
              <small>{labels[item.skill]}</small>
              <h2>
                <Link href={lessonHref(item)}>{item.title}</Link>
              </h2>
              <div>
                <Link href={lessonHref(item)}>继续学习 / Continue →</Link>
                <button
                  type="button"
                  aria-label={`移出我的库：${item.title}`}
                  onClick={() => {
                    void removeSavedLesson(item).catch(() =>
                      setError(
                        "移除失败，请重试 / Could not remove. Try again.",
                      ),
                    );
                  }}
                >
                  移出 / Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="saved-empty">
          还没有保存。遇到想留的内容，点击「保存到我的库」。 / Nothing saved
          yet. Save a lesson whenever you want to keep it.
        </p>
      )}
    </section>
  );
}
