"use client";
import { ui } from "@/lib/ui";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lastSkill } from "@/lib/learning-entry";
import { getSample } from "@/lib/samples";
import { SampleReader } from "./sample-reader";
import { dailyReading, localDay } from "@/lib/daily";
import { useHydrated } from "./use-hydrated";
import { firstPublicationDate } from "@/lib/published-catalog";
import { loadDailyEdition } from "@/lib/daily-feed";

export function ResumeLearning() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/${lastSkill()}`);
  }, [router]);
  return (
    <main className="page entry-loading" aria-busy="true">
      <p role="status">{ui("正在接着学…")}</p>
    </main>
  );
}
export function DirectReading({
  language = "en",
  part = 0,
}: {
  language?: "en" | "de";
  part?: 0 | 1;
}) {
  const [day] = useState(localDay);
  const hydrated = useHydrated();
  const firstPublished = firstPublicationDate();
  const needsPublication =
    language === "en" && Boolean(firstPublished && day >= firstPublished);
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!needsPublication) return;
    let live = true;
    void loadDailyEdition(day)
      .then((edition) => {
        if (live) {
          setPublishedIds(edition?.articles.map((article) => article.id) ?? []);
        }
      })
      .catch(() => {
        /* The last processed edition is already readable. */
      });
    return () => {
      live = false;
    };
  }, [day, needsPublication]);
  if (!hydrated)
    return (
      <main className="page entry-loading" aria-busy="true">
        <p role="status">正在打开今日阅读 / Opening today’s reading…</p>
      </main>
    );
  const sample = getSample(
    (needsPublication ? publishedIds[part] : undefined) ??
      dailyReading(day, language, part),
  )!;
  return (
    <SampleReader
      article={sample}
      daily={day}
      dailyPart={language === "en" ? part : undefined}
    />
  );
}
