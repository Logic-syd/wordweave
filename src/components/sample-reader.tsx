"use client";
import { useState } from "react";
import type { ArticleDetail } from "@/lib/types";
import { sampleWithProgress } from "@/lib/sample-storage";
import { settingsSchema } from "@/lib/schemas";
import { useHydrated } from "./use-hydrated";
import { Reader } from "./reader";

function SavedSample({ article }: { article: ArticleDetail }) {
  const [initial] = useState(() => sampleWithProgress(article));
  return (
    <Reader
      initial={initial}
      configured={false}
      autoGenerate={false}
      initialSettings={settingsSchema.parse(article.version!.settings)}
      local
    />
  );
}
export function SampleReader({ article }: { article: ArticleDetail }) {
  const hydrated = useHydrated();
  return hydrated ? (
    <SavedSample key={article.id} article={article} />
  ) : (
    <main className="page">
      <h1>{article.title}</h1>
      <p>正在打开范文…</p>
    </main>
  );
}
