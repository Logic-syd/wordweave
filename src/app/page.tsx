import { withPageOwner } from "@/lib/auth-page";
import Link from "next/link";
import { ArrowRight, Sprout, BookOpen, CircleHelp } from "lucide-react";
import { listArticles } from "@/lib/repository";
import { modelConfigured } from "@/lib/generation";
import { ArticleCard } from "@/components/article-card";
import { SpriteIcon } from "@/components/sprite-icon";
import { LearningResources } from "@/components/learning-resources";
import type { LibraryArticle } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Home() {
  return withPageOwner(async () => {
    const articles = JSON.parse(
      JSON.stringify(await listArticles()),
    ) as LibraryArticle[];
    const recent = articles.slice(0, 4);
    const hasAPI = modelConfigured();
    return (
      <main className="page home-page">
        <div className="page-topline">
          <span className="eyebrow">少一点死记硬背，多一点上下文</span>
          <span className="personal-label">
            <span className="tiny-dot" />
            个人学习空间
          </span>
        </div>
        <div className="page-heading">
          <h1>
            读一点，<span>学会一点。</span>
          </h1>
          <p>读懂技术，也让一门新语言慢慢融入日常。</p>
        </div>
        <div className="mode-grid">
          <Link href="/new?mode=tech" className="mode-card tech-mode">
            <div className="mode-top">
              <span className="mode-icon">
                <SpriteIcon size={28} />
              </span>
              <span className="mode-language">EN → 中文 + English</span>
            </div>
            <div>
              <span className="eyebrow">给好奇的开发者</span>
              <h2>读技术文章</h2>
              <p>
                理解内容，留下值得学的英文表达。
                <br />
                让长文章，不再成为阅读的门槛。
              </p>
            </div>
            <div className="mode-bottom">
              <span>导入一篇文章</span>
              <span className="circle-arrow">
                <ArrowRight size={19} />
              </span>
            </div>
          </Link>
          <Link href="/new?mode=german" className="mode-card german-mode">
            <div className="mode-top">
              <span className="mode-icon">
                <Sprout size={26} />
              </span>
              <span className="mode-language">中文故事 + Deutsch</span>
            </div>
            <div>
              <span className="eyebrow">给日常一点新鲜感</span>
              <h2>读一点德语</h2>
              <p>
                从一段有趣的小故事开始。
                <br />
                在熟悉的语境里，遇见新的德语词。
              </p>
            </div>
            <div className="mode-bottom">
              <span>开启一段故事</span>
              <span className="circle-arrow">
                <ArrowRight size={19} />
              </span>
            </div>
          </Link>
        </div>
        {!hasAPI && (
          <div className="notice demo-notice">
            <CircleHelp size={18} />
            <div>
              <strong>先读一篇，感受一下。</strong>
              <span>
                {" "}
                演示文章可完整体验阅读、词卡与收藏。创作新内容需要配置模型 API。
              </span>
            </div>
          </div>
        )}
        <section className="recent-section">
          <div className="section-heading">
            <h2>
              <BookOpen size={20} />
              接着读，或从这里开始
            </h2>
            <Link href="/library">
              全部文章 <ArrowRight size={16} />
            </Link>
          </div>
          {recent.length ? (
            <div className="recent-grid">
              {recent.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <BookOpen size={28} />
              <h3>你的第一篇文章，从这里开始</h3>
              <p>导入英文技术文章，或生成一段德语故事。</p>
              <Link href="/new?mode=tech" className="button primary">
                添加文章
              </Link>
            </div>
          )}
        </section>
        <LearningResources />
        <div className="quiet-tip">
          <span>一点阅读建议</span>
          <p>
            不用记住每一个词。遇到想学的表达，点开它，让它在下一次阅读里再与你见面。
          </p>
        </div>
      </main>
    );
  }, "/");
}
