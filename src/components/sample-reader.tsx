"use client";
import { ui } from "@/lib/ui";

import { useState } from "react";
import type { ArticleDetail } from "@/lib/types";
import { sampleWithProgress } from "@/lib/sample-storage";
import { settingsSchema } from "@/lib/schemas";
import { useHydrated } from "./use-hydrated";
import { Reader } from "./reader";

function SavedSample({
  article,
  daily,
  dailyPart,
}: {
  article: ArticleDetail;
  daily?: string;
  dailyPart?: 0 | 1;
}) {
  const [initial] = useState(() => sampleWithProgress(article));
  return (
    <Reader
      initial={initial}
      configured={false}
      autoGenerate={false}
      initialSettings={settingsSchema.parse(article.version!.settings)}
      local
      daily={daily}
      dailyPart={dailyPart}
    />
  );
}
export function SampleReader({
  article,
  daily,
  dailyPart,
}: {
  article: ArticleDetail;
  daily?: string;
  dailyPart?: 0 | 1;
}) {
  const hydrated = useHydrated();
  return hydrated ? (
    <SavedSample
      key={article.id}
      article={article}
      daily={daily}
      dailyPart={dailyPart}
    />
  ) : (
    <main className="page">
      <h1>{article.title}</h1>
      <p>{ui("正在打开范文…")}</p>
    </main>
  );
}
