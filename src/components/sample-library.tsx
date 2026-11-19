"use client";
import { useEffect, useState } from "react";
import { localShelf } from "@/lib/browser-store";
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
  const [initial, setInitial] = useState<LibraryArticle[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let live = true; void localShelf().then(articles => { if(live) setInitial([...articles, ...personal, ...sampleShelf()]); }).catch(e => setError(e.message)); return () => { live=false; }; }, [personal]);
  if (!initial) return <main className="page"><h1>本地书架</h1><p>{error || "正在读取…"}</p></main>;
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
