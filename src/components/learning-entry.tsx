"use client";
import { ui } from "@/lib/ui";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lastSkill } from "@/lib/learning-entry";
import { getSample } from "@/lib/samples";
import { SampleReader } from "./sample-reader";
import { dailyReading, localDay } from "@/lib/daily";
import { useHydrated } from "./use-hydrated";

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
export function DirectReading({ language = "en" }: { language?: "en" | "de" }) {
  const [day] = useState(localDay);
  const hydrated = useHydrated();
  if (!hydrated)
    return (
      <main className="page entry-loading" aria-busy="true">
        <p role="status">正在打开今日阅读 / Opening today’s reading…</p>
      </main>
    );
  const sample = getSample(dailyReading(day, language))!;
  return <SampleReader article={sample} daily={day} />;
}
