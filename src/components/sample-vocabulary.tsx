"use client";
import { useState } from "react";
import type { VocabularyView } from "@/lib/types";
import { sampleVocabulary } from "@/lib/sample-storage";
import { useHydrated } from "./use-hydrated";
import { Vocabulary } from "./vocabulary";

function SavedWords({ personal }: { personal: VocabularyView[] }) {
  const [initial] = useState(() => [
    ...personal,
    ...sampleVocabulary().filter((w) => w.user),
  ]);
  return <Vocabulary initial={initial} />;
}
export function SampleVocabulary({ personal }: { personal: VocabularyView[] }) {
  return useHydrated() ? (
    <SavedWords personal={personal} />
  ) : (
    <main className="page">
      <h1>生词本</h1>
      <p>正在读取收藏…</p>
    </main>
  );
}
