"use client";
import { useEffect, useState } from "react";
import { loadPublishedSample } from "@/lib/daily-feed";
import type { ArticleDetail } from "@/lib/types";
import { SampleReader } from "./sample-reader";

export function PublishedReader({ id }: { id: string }) {
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    void loadPublishedSample(id)
      .then((result) => {
        if (!result)
          throw new Error(
            "这篇每日文章暂时无法读取。 / This daily article is temporarily unavailable.",
          );
        if (live) setArticle(result);
      })
      .catch(() => {
        if (live)
          setError(
            "暂时无法下载这篇文章，请检查网络后重试。收藏与进度仍然保留。 / Could not download this article. Your bookmarks and progress are kept.",
          );
      });
    return () => {
      live = false;
    };
  }, [id, retry]);
  if (article) return <SampleReader article={article} />;
  return (
    <main className="page entry-loading">
      <p role={error ? "alert" : "status"}>
        {error || "正在打开每日文章… / Opening the daily article…"}
      </p>
      {error && (
        <button
          className="button secondary"
          onClick={() => {
            setError("");
            setRetry((n) => n + 1);
          }}
        >
          重试 / Retry
        </button>
      )}
    </main>
  );
}
