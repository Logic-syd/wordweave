"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lastReading, lastSkill } from "@/lib/learning-entry";
import { localShelf } from "@/lib/browser-store";
import { getSample } from "@/lib/samples";
import { BrowserReader } from "./browser-pages";
import { SampleReader } from "./sample-reader";

export function ResumeLearning() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/${lastSkill()}`);
  }, [router]);
  return (
    <main className="page entry-loading" aria-busy="true">
      <p role="status">正在接着学…</p>
    </main>
  );
}
export function DirectReading() {
  const [id, setId] = useState<string>();
  useEffect(() => {
    let live = true;
    void localShelf()
      .catch(() => [])
      .then((articles) => {
        const previous = lastReading();
        const selected =
          previous &&
          (getSample(previous) || articles.some((a) => a.id === previous))
            ? previous
            : (articles[0]?.id ?? "sample-react-state-v1");
        if (live) setId(selected);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!id)
    return (
      <main className="page entry-loading" aria-busy="true">
        <p role="status">正在打开上次那一篇…</p>
      </main>
    );
  const sample = getSample(id);
  return sample ? (
    <SampleReader article={sample} />
  ) : (
    <BrowserReader key={id} id={id} autoGenerate={false} />
  );
}
