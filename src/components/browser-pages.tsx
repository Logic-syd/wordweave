"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  browserData,
  localArticle,
  localPracticeState,
  localReviewWords,
  localShelf,
  localWords,
} from "@/lib/browser-store";
import { recoverLocalArticle } from "@/lib/browser-generation";
import { browserAiReady } from "@/lib/browser-ai";
import { materialFromWord, practiceSamples } from "@/lib/practice-content";
import { sampleVocabulary } from "@/lib/sample-storage";
import type { PracticeSkill, PracticeMaterial } from "@/lib/practice-schemas";
import type { PracticeState } from "@/lib/practice-store";
import type { Settings } from "@/lib/schemas";
import { settingsSchema } from "@/lib/schemas";
import type { LibraryArticle, VocabularyView } from "@/lib/types";
import { NewForm } from "./new-form";
import { Reader } from "./reader";
import { PracticeStudio } from "./practice-studio";
import { ArticleCard } from "./article-card";
import { LocalAiNotice, useBrowserAi } from "./browser-ai-settings";

export function BrowserNewPage({ mode }: { mode: "tech" | "german" }) {
  const config = useBrowserAi();
  const [data, setData] = useState<{
      settings: Settings;
      due: string[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      browserData(false, (d) => d.preferences[mode === "tech" ? "en" : "de"]),
      localReviewWords(),
    ])
      .then(([p, due]) => {
        if (live)
          setData({
            settings: settingsSchema.parse(p?.settings ?? {}),
            due: due.map((w) => w.lemma),
          });
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [mode]);
  if (!data) return <Loading error={error} />;
  return (
    <NewForm
      key={mode}
      mode={mode}
      configured={browserAiReady(config)}
      initialSettings={data.settings}
      dueWords={data.due}
      authorized
      browserLocal
    />
  );
}
export function BrowserReader({
  id,
  autoGenerate,
}: {
  id: string;
  autoGenerate: boolean;
}) {
  const config = useBrowserAi();
  const [article, setArticle] = useState<Awaited<
      ReturnType<typeof localArticle>
    > | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void recoverLocalArticle(id)
      .then((a) => {
        if (live) setArticle(a);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (!article) return <Loading error={error} />;
  return (
    <Reader
      key={id}
      initial={article}
      configured={browserAiReady(config)}
      initialSettings={article.version?.settings ?? article.draftSettings}
      autoGenerate={autoGenerate && browserAiReady(config)}
    />
  );
}
export function BrowserPracticePage({
  skill,
  material,
  word,
  paragraph,
}: {
  skill: PracticeSkill;
  material?: string;
  word?: string;
  paragraph?: string;
}) {
  const config = useBrowserAi();
  const [data, setData] = useState<{
      state: PracticeState;
      words: VocabularyView[];
      materials: PracticeMaterial[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([localPracticeState(), localWords()])
      .then(([state, words]) => {
        const target =
          word ??
          ((material ?? state.progress[skill]?.mid)?.startsWith("word:")
            ? (material ?? state.progress[skill]!.mid).slice(5)
            : undefined);
        const item = [...words, ...sampleVocabulary()].find(
          (w) => w.id === target,
        );
        if (target && !item)
          throw new Error("这个词不在当前浏览器里，请从自己的单词库选择。");
        if (live)
          setData({
            state,
            words,
            materials: [
              ...(item ? [materialFromWord(item)] : []),
              ...state.materials,
              ...practiceSamples,
            ],
          });
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [skill, material, word]);
  if (!data) return <Loading error={error} />;
  return (
    <PracticeStudio
      key={`${skill}:${material ?? word ?? "resume"}:${paragraph ?? ""}`}
      skill={skill}
      owner="browser"
      initialState={data.state}
      initialWords={data.words}
      materials={data.materials}
      requestedMaterial={word ? `word:${word}` : material}
      requestedParagraph={paragraph}
      aiAvailable={browserAiReady(config)}
    />
  );
}
export function LocalRecentReading() {
  const [articles, setArticles] = useState<LibraryArticle[]>([]);
  useEffect(() => {
    let live = true;
    void localShelf()
      .then((a) => {
        if (live) setArticles(a.slice(0, 2));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <LocalAiNotice />
      {articles.length > 0 && (
        <section className="recent-section">
          <div className="section-heading">
            <h2>接着读自己的文章</h2>
            <Link href="/library">打开本地书架 →</Link>
          </div>
          <div className="recent-grid">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function Loading({ error }: { error: string }) {
  return (
    <main className="page">
      <h1>{error ? "暂时无法打开" : "正在打开本地学习空间…"}</h1>
      <p className="practice-notice" role={error ? "alert" : "status"}>
        {error || "文章、词卡和练习记录只保存在当前浏览器。"}
      </p>
      <Link href="/">返回首页 →</Link>
    </main>
  );
}
