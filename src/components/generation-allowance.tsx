"use client";

import { useEffect, useState } from "react";
import type { GenerationBudget } from "@/lib/generation-budget";

/** A display only: all spending checks happen atomically on the server. */
export function GenerationAllowance() {
  const [budget, setBudget] = useState<GenerationBudget | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || controller.signal.aborted || document.hidden) return;
      pending = true;
      try {
        const response = await fetch("/api/generation/budget", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Cannot read budget");
        const data: GenerationBudget = await response.json();
        if (!controller.signal.aborted) {
          setBudget(data);
          setUnavailable(false);
        }
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        pending = false;
      }
    }
    void refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("wordweave:generation-budget", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("wordweave:generation-budget", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (unavailable)
    return (
      <p className="field-hint">暂时无法读取今日额度，生成时仍会检查上限。</p>
    );
  if (!budget) return null;
  const exhausted =
    budget.generations.remaining === 0 ||
    budget.modelRequests.remaining === 0 ||
    budget.inputCharacters.remaining === 0;
  return (
    <details className="generation-allowance">
      <summary>
        今日已生成 {budget.generations.used} / {budget.generations.limit} 次
        {budget.paused ? " · 生成已暂停" : exhausted ? " · 今日额度已用完" : ""}
      </summary>
      <p>
        模型请求 {budget.modelRequests.used} / {budget.modelRequests.limit} 次；
        输入字符 {budget.inputCharacters.used.toLocaleString("zh-CN")} /{" "}
        {budget.inputCharacters.limit.toLocaleString("zh-CN")}。
      </p>
      <p>
        每日 UTC 00:00
        重置。失败的生成也计次；长文分块和自动重试会分别消耗模型请求额度。
        这些是用量限制，不等于精确 token 账单。
      </p>
    </details>
  );
}
