import Link from "next/link";
import {
  ArrowUpRight,
  Coffee,
  Check,
  ChevronRight,
} from "lucide-react";
import { SpriteIcon } from "@/components/sprite-icon";
import type { LibraryArticle } from "@/lib/types";
export function ArticleCard({
  article: a,
  compact = false,
}: {
  article: LibraryArticle;
  compact?: boolean;
}) {
  const de = a.mode === "german";
  return (
    <Link
      href={`/read/${a.id}`}
      className={`article-card ${compact ? "compact" : ""}`}
    >
      <div className={`article-symbol ${de ? "sage" : "rose"}`}>
        {de ? <Coffee size={23} /> : <SpriteIcon size={25} />}
      </div>
      <div className="article-card-body">
        <div className="article-meta">
          <span>{de ? `德语 · ${a.level ?? "A2"}` : "技术英语"}</span>
          <span className="meta-dot">·</span>
          <span>
            {a.origin.startsWith("demo")
              ? "演示文章"
              : a.origin === "generated"
                ? "生成短文"
                : "导入文章"}
          </span>
        </div>
        <h3>{a.title}</h3>
        {!compact && <p>{a.preview || "输入已保存，等待生成学习版。"}</p>}
        <div className="article-status">
          {a.progress?.completed ? (
            <>
              <Check size={13} />
              已读完 · 可随时复习
            </>
          ) : a.progress?.paragraphId ? (
            <>
              <span className="tiny-dot" />
              继续上次阅读
            </>
          ) : a.activeVersionId ? (
            "准备好了，开始阅读"
          ) : a.generationStartedAt ? (
            "正在生成学习版…"
          ) : a.generationError ? (
            "生成遇到问题 · 点击重试"
          ) : (
            "原文已保存"
          )}
        </div>
      </div>
      {compact ? (
        <ChevronRight size={18} className="muted" />
      ) : (
        <ArrowUpRight size={19} className="muted" />
      )}
    </Link>
  );
}
