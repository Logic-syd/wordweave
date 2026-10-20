"use client";
import { useState } from "react";
import type { LibraryArticle } from "@/lib/types";
import { sampleShelf } from "@/lib/sample-storage";
import { useHydrated } from "./use-hydrated";
import { Library } from "./library";

function SavedShelf({
  personal,
  mode,
}: {
  personal: LibraryArticle[];
  mode: string;
}) {
  const [initial] = useState(() => [...personal, ...sampleShelf()]);
  return <Library initial={initial} initialMode={mode} />;
}
export function SampleLibrary({
  personal,
  mode,
}: {
  personal: LibraryArticle[];
  mode: string;
}) {
  return useHydrated() ? (
    <SavedShelf personal={personal} mode={mode} />
  ) : (
    <main className="page">
      <h1>文章库</h1>
      <p>正在打开书架…</p>
    </main>
  );
}
