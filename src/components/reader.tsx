"use client";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Settings2,
  Sparkles,
  X,
  AlertCircle,
} from "lucide-react";
import type { ArticleDetail, OccurrenceView, UserWord } from "@/lib/types";
import { settingsSchema, type Settings, type Segment } from "@/lib/schemas";
import { useHydrated } from "./use-hydrated";
import { WordCard } from "./word-card";
import { SettingsFields } from "./settings-fields";
type SavedSegment = Segment & { occurrenceId?: string };
const markdownPlugins = [remarkGfm];
const EMPTY_OCCURRENCES: OccurrenceView[] = [];
type TermContextValue = {
  occurrences: OccurrenceView[];
  firstIds: Map<string, string>;
  gloss: string;
  clickedGloss: Set<string>;
  hydrated: boolean;
  open: (o: OccurrenceView) => void;
};
const TermContext = createContext<TermContextValue | null>(null);
function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const context = useContext(TermContext);
  if (context && href?.startsWith("/__term/")) {
    const occurrence = context.occurrences.find((o) => o.id === href.slice(8));
    if (!occurrence) return <span>{children}</span>;
    const show =
      occurrence.word.user?.status !== "KNOWN" &&
      (context.gloss === "all" ||
        (context.gloss === "first" &&
          context.firstIds.get(occurrence.vocabularyId) === occurrence.id) ||
        (context.gloss === "click" && context.clickedGloss.has(occurrence.id)));
    return (
      <span className="annotated-term">
        <button
          className={`term-button ${occurrence.word.user?.favorite ? "favorited" : ""}`}
          data-occurrence={occurrence.id}
          disabled={!context.hydrated}
          aria-label={`查看词卡：${occurrence.form}`}
          onClick={() => context.open(occurrence)}
        >
          {children}
        </button>
        {show && <span className="gloss">（{occurrence.meaning}）</span>}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
// Stable component identities keep terms, code and keyboard focus mounted while
// progress feedback or a wordcard updates elsewhere in the reader.
const readingComponents: Components = {
  a: MarkdownLink,
  pre: ({ children }) => (
    <div className="code-scroll">
      <pre>{children}</pre>
    </div>
  ),
  table: ({ children }) => (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  ),
};
export function Reader({
  initial,
  configured,
  autoGenerate,
  initialSettings,
}: {
  initial: ArticleDetail;
  configured: boolean;
  autoGenerate: boolean;
  initialSettings: Settings;
}) {
  const hydrated = useHydrated();
  const [article, setArticle] = useState(initial);
  const [view, setView] = useState(initial.progress?.view ?? "learning");
  const [gloss, setGloss] = useState(
    initial.progress?.glossMode ?? initial.defaultGlossMode,
  );
  const [selected, setSelected] = useState<OccurrenceView | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [completed, setCompleted] = useState(
    initial.progress?.completed ?? false,
  );
  const active = useRef(initial.progress?.paragraphId ?? "p0001");
  const autoStarted = useRef(false);
  const genLock = useRef(false);
  const restored = useRef(false);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgress = useRef<Record<string, unknown>>({});
  const [clickedGloss, setClickedGloss] = useState<Set<string>>(
    () => new Set(),
  );
  const persist = useCallback(
    (data: Record<string, unknown>) => {
      pendingProgress.current = { ...pendingProgress.current, ...data };
      if (progressTimer.current) clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => {
        const payload = pendingProgress.current;
        pendingProgress.current = {};
        void fetch(`/api/articles/${initial.id}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        })
          .then((r) => {
            setSaveState(r.ok ? "阅读进度已保存" : "进度保存失败，请检查连接");
          })
          .catch(() => setSaveState("进度保存失败，请检查连接"));
      }, 400);
    },
    [initial.id],
  );
  useEffect(
    () => () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
      if (Object.keys(pendingProgress.current).length)
        void fetch(`/api/articles/${initial.id}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingProgress.current),
          keepalive: true,
        });
    },
    [initial.id],
  );
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/articles/${initial.id}`, { cache: "no-store" });
    if (r.ok) {
      const data = (await r.json()) as ArticleDetail;
      setArticle(data);
      return data;
    }
  }, [initial.id]);
  const runGeneration = useCallback(async () => {
    if (genLock.current) return;
    genLock.current = true;
    setGenerating(true);
    setError("");
    try {
      const r = await fetch(`/api/articles/${initial.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      const latest = await refresh();
      if (latest?.version) {
        setSettings(settingsSchema.parse(latest.version.settings));
        setView("learning");
        persist({ view: "learning" });
        setShowSettings(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败，请稍后重试");
      await refresh();
    } finally {
      genLock.current = false;
      setGenerating(false);
    }
  }, [initial.id, settings, refresh, persist]);
  useEffect(() => {
    if (autoGenerate && !autoStarted.current) {
      autoStarted.current = true;
      window.history.replaceState(null, "", `/read/${initial.id}`);
      void runGeneration();
    }
  }, [autoGenerate, initial.id, runGeneration]);
  useEffect(() => {
    if (!article.generationStartedAt) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [article.generationStartedAt, refresh]);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const hash = window.location.hash.slice(1);
    const target = hash || initial.progress?.paragraphId;
    if (target)
      requestAnimationFrame(() => {
        document.getElementById(target)?.scrollIntoView({ block: "start" });
        active.current = target;
      });
  }, [initial]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (first && first.target.id !== active.current) {
          active.current = first.target.id;
          persist({ paragraphId: first.target.id });
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );
    document
      .querySelectorAll("[data-paragraph]")
      .forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, [article.version?.id, view, persist]);
  function switchView(next: string) {
    if (view === next) return;
    const id = active.current;
    const before = document.getElementById(id)?.getBoundingClientRect().top;
    setView(next);
    persist({ view: next, paragraphId: id });
    requestAnimationFrame(() => {
      const after = document.getElementById(id)?.getBoundingClientRect().top;
      if (before !== undefined && after !== undefined)
        window.scrollBy({ top: after - before, behavior: "instant" });
    });
  }
  function updateWord(user: UserWord) {
    if (!selected) return;
    setArticle((prev) => ({
      ...prev,
      version: prev.version
        ? {
            ...prev.version,
            occurrences: prev.version.occurrences.map((o) =>
              o.vocabularyId === selected.vocabularyId
                ? { ...o, word: { ...o.word, user } }
                : o,
            ),
          }
        : null,
    }));
    setSelected((prev) =>
      prev ? { ...prev, word: { ...prev.word, user } } : null,
    );
  }
  const occurrences = article.version?.occurrences ?? EMPTY_OCCURRENCES;
  const firstIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of article.version?.paragraphs ?? [])
      for (const segment of p.segments as SavedSegment[]) {
        if (segment.type !== "term") continue;
        const occurrence = occurrences.find(
          (o) => o.id === segment.occurrenceId,
        );
        if (occurrence && !map.has(occurrence.vocabularyId))
          map.set(occurrence.vocabularyId, occurrence.id);
      }
    return map;
  }, [article.version?.paragraphs, occurrences]);
  const openWord = useCallback(
    (occurrence: OccurrenceView) => {
      setSelected(occurrence);
      if (gloss === "click")
        setClickedGloss((prev) => new Set(prev).add(occurrence.id));
    },
    [gloss],
  );
  const termContext = useMemo(
    () => ({
      occurrences,
      firstIds,
      gloss,
      clickedGloss,
      hydrated,
      open: openWord,
    }),
    [occurrences, firstIds, gloss, clickedGloss, hydrated, openWord],
  );
  const definitions = article.sourceBlocks
    .filter((b) => b.kind === "definition")
    .map((b) => b.original)
    .join("\n\n");
  function renderMarkdown(markdown: string, interactive = false) {
    return (
      <TermContext.Provider value={interactive ? termContext : null}>
        <ReactMarkdown
          remarkPlugins={markdownPlugins}
          skipHtml
          components={readingComponents}
        >
          {markdown + "\n\n" + definitions}
        </ReactMarkdown>
      </TermContext.Provider>
    );
  }
  function learningMarkdown(segments: Segment[]) {
    return (segments as SavedSegment[])
      .map((s) =>
        s.type === "text"
          ? s.text
          : `[${s.text.replace(/[\\[\]]/g, "\\$&")}](/__term/${s.occurrenceId})`,
      )
      .join("");
  }
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!article.generationStartedAt) return;
    const timer = setInterval(() => setClock(Date.now()), 2000);
    return () => clearInterval(timer);
  }, [article.generationStartedAt]);
  const pending =
    generating ||
    Boolean(
      article.generationStartedAt &&
      clock - new Date(article.generationStartedAt).getTime() < 10 * 60000,
    );
  const de = article.mode === "german";
  const coverage = article.version?.coverage;
  return (
    <main className="reader-page">
      <div className="reader-top">
        <Link href="/library" className="back-link">
          <ArrowLeft size={16} />
          文章库
        </Link>
        <span className="reader-top-meta">
          {de ? "德语日常" : "技术英语"}
          <span> / </span>
          {article.origin.includes("generated")
            ? "生成短文"
            : article.origin.startsWith("demo")
              ? "演示文章"
              : "导入文章"}
        </span>
        <button
          className={`icon-button ${showSettings ? "selected" : ""}`}
          aria-label="生成设置"
          aria-expanded={showSettings}
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings2 size={20} />
        </button>
      </div>
      <div className="reader-toolbar">
        <div className="segmented reader-views">
          <button
            className={view === "learning" ? "selected" : ""}
            onClick={() => switchView("learning")}
          >
            {de ? "中文嵌词版" : "学习版"}
          </button>
          <button
            className={view === "original" ? "selected" : ""}
            onClick={() => switchView("original")}
          >
            {de ? "德语全文" : "英文原文"}
          </button>
        </div>
        <label className="gloss-control">
          释义
          <select
            aria-label="释义显示方式"
            value={gloss}
            onChange={(e) => {
              setGloss(e.target.value);
              persist({ glossMode: e.target.value });
            }}
          >
            <option value="all">全部显示</option>
            <option value="first">首次出现显示</option>
            <option value="click">点击显示</option>
          </select>
        </label>
      </div>
      {showSettings && (
        <section className="reader-settings">
          <div className="section-heading">
            <h3>调整这篇学习材料</h3>
            <button
              className="icon-button"
              aria-label="关闭生成设置"
              onClick={() => setShowSettings(false)}
            >
              <X size={17} />
            </button>
          </div>
          <SettingsFields
            mode={article.mode}
            value={settings}
            onChange={setSettings}
            disabled={pending}
            compact
          />
          <p className="field-hint">
            {de
              ? "已有原文会保留，重新生成同一内容的学习版。"
              : "重新生成会使用完整原文，代码不会交给模型。"}{" "}
            此操作会调用
            API；失败会保留当前成功版本。语言内容可能有误，请对照原文。
          </p>
          {!configured && (
            <p className="field-hint">
              请先在服务端配置 LLM_API_KEY、LLM_BASE_URL 和 LLM_MODEL。
            </p>
          )}
          <button
            className="button primary"
            disabled={pending || !configured}
            onClick={() => void runGeneration()}
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            明确重新生成
          </button>
        </section>
      )}
      {pending && (
        <div className="notice generation-banner" role="status">
          <LoaderCircle className="spin" size={18} />
          <div>
            正在生成学习版…
            长文章会逐块处理。你可以继续阅读已有内容，请勿重复提交。
          </div>
        </div>
      )}
      {(error || article.generationError) && (
        <div className="error-box reader-error" role="alert">
          <AlertCircle size={17} />
          <div>
            {error || article.generationError}
            <button
              className="text-button"
              onClick={() => setShowSettings(true)}
            >
              检查设置并重试 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
      <article className="reading-content">
        <header className="article-heading">
          <div className="eyebrow">
            {de ? "DEUTSCH IM ALLTAG" : "TECHNICAL ENGLISH"}{" "}
            <span className="meta-dot">·</span>{" "}
            {de
              ? (article.version?.settings.level ?? settings.level)
              : "CONTEXT READING"}
          </div>
          <h1>{article.title}</h1>
          <div className="reading-meta">
            <span>
              {article.origin.startsWith("demo") ? "结构化演示 · " : ""}
              {article.origin.includes("generated")
                ? "生成短文"
                : de
                  ? "导入原文 · 学习改写版"
                  : "英文原文 · 中文学习版"}
            </span>
            {article.version && (
              <span>
                {coverage?.newWords.length ?? 0} 个学习表达
                {coverage?.reviewWords.length
                  ? ` · ${coverage.reviewWords.length} 个复习词`
                  : ""}
              </span>
            )}
          </div>
          {article.sourceUrl && (
            <a
              className="source-link"
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看来源 ↗
            </a>
          )}
          <div className="reading-hint">
            <BookOpen size={15} />
            {view === "learning"
              ? "点击带下划线的外语表达，打开语境词卡。"
              : "完整原文已保存。随时切换回学习版，段落位置会尽量保持。"}
          </div>
        </header>
        {!article.version && view === "learning" && (
          <div className="notice no-version">
            <Sparkles size={19} />
            <div>
              <strong>原文已保存，学习版尚未生成。</strong>
              <p>
                {configured
                  ? "点击右上角设置，生成你的学习材料。"
                  : "演示文章无需 API。为新文章生成学习版，需要配置服务端模型 API。"}
              </p>
              {article.sourceText && (
                <button
                  className="text-button"
                  onClick={() => switchView("original")}
                >
                  先阅读原文 →
                </button>
              )}
            </div>
          </div>
        )}
        <div className="paragraphs">
          {(article.version
            ? article.version.paragraphs
            : article.sourceBlocks.map((b, i) => ({
                id: b.id,
                sourceId: b.id,
                position: i,
                original: b.original,
                segments: [{ type: "text" as const, text: b.original }],
              }))
          ).map((p) => (
            <section
              id={p.sourceId}
              data-paragraph
              key={p.sourceId}
              className={`reading-paragraph ${view === "original" ? "original-view" : ""}`}
              lang={view === "original" ? (de ? "de" : "en") : "zh-CN"}
            >
              {renderMarkdown(
                view === "original" ? p.original : learningMarkdown(p.segments),
                view === "learning",
              )}{" "}
              {view === "learning" &&
                article.version &&
                ![
                  "code",
                  "heading",
                  "thematicBreak",
                  "html",
                  "definition",
                ].includes(
                  article.sourceBlocks.find((b) => b.id === p.sourceId)?.kind ??
                    "",
                ) && (
                  <details className="original-details">
                    <summary>
                      <ChevronDown size={12} />
                      {de ? "对照德语" : "查看英文原文"}
                    </summary>
                    <div lang={de ? "de" : "en"}>
                      {renderMarkdown(p.original)}
                    </div>
                  </details>
                )}
            </section>
          ))}
        </div>
        {article.sourceText && (
          <footer className="reading-end">
            <span className="end-line" />
            <span>读到这里，刚刚好。</span>
            <button
              className={`button ${completed ? "secondary" : "primary"}`}
              onClick={() => {
                setCompleted(!completed);
                persist({ completed: !completed, paragraphId: active.current });
              }}
            >
              <Check size={17} />
              {completed ? "已读完 · 再读一遍也很好" : "标记读完"}
            </button>
            <p>阅读是一种接触，不等于掌握。想学的词，记得在词卡里留下。</p>
          </footer>
        )}
        {de && coverage && (
          <details className="coverage-panel">
            <summary>
              本篇词汇覆盖 <ChevronDown size={15} />
            </summary>
            <p>
              新词 {coverage.newWords.length} / 目标 {coverage.requestedNew}：
              {coverage.newWords.join("、") || "无（只复习）"}
            </p>
            <p>
              复习 {coverage.reviewWords.length} / 待复习目标{" "}
              {coverage.requestedReview}：
              {coverage.reviewWords.join("、") || "无"}
            </p>
            {coverage.missing.length > 0 && (
              <p className="error-text">
                未覆盖：{coverage.missing.join("、")}。未计入本篇出现记录。
              </p>
            )}
            <p className="muted">
              覆盖只根据学习版中实际出现的标注词统计；不代表已掌握。
            </p>
          </details>
        )}
        <div className="reader-save-state" role="status">
          {saveState || "进度与偏好会自动保存"}
        </div>
      </article>
      {selected && (
        <WordCard
          key={selected.id}
          word={selected.word}
          context={{ meaning: selected.meaning, sentence: selected.sentence }}
          onClose={() => setSelected(null)}
          onUpdate={updateWord}
        />
      )}
    </main>
  );
}
