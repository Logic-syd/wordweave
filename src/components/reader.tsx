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
const GENERATION_STALE_MS = 6 * 60_000;
const generationStages = [
  { id: "preparing", label: "准备文章", description: "正在整理正文与学习目标" },
  { id: "translating", label: "生成内容", description: "正在生成学习版" },
  {
    id: "validating",
    label: "检查内容",
    description: "正在检查段落对应、代码与词卡",
  },
  { id: "saving", label: "保存文章", description: "正在保存学习版与词卡" },
];
function timestamp(value: string | null | undefined) {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : 0;
}
function elapsedTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60
    ? `${seconds} 秒`
    : `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
}
function GenerationElapsed({ startedAt }: { startedAt: number }) {
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return (
    <span className="reader-generation-elapsed">
      已用时 {hydrated && startedAt ? elapsedTime(now - startedAt) : "—"}
    </span>
  );
}
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
  // Article and model image URLs are not fetched automatically: they may track
  // readers or be instructions embedded in untrusted source material.
  img: ({ alt }) => (
    <span className="reader-image-placeholder">
      [图片{alt ? `：${alt}` : ""}]
    </span>
  ),
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
  const [progressError, setProgressError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [localGenerationStart, setLocalGenerationStart] = useState(0);
  const [saveState, setSaveState] = useState("");
  const [completed, setCompleted] = useState(
    initial.progress?.completed ?? false,
  );
  const active = useRef(initial.progress?.paragraphId ?? "p0001");
  const autoStarted = useRef(false);
  const genLock = useRef(false);
  const generationRequest = useRef<AbortController | null>(null);
  const generationVersionBeforeRequest = useRef(initial.version?.id ?? null);
  const observedServerGeneration = useRef(Boolean(initial.generationStartedAt));
  const terminalGeneration = useRef<ArticleDetail | null>(null);
  const restored = useRef(false);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgress = useRef<Record<string, unknown>>({});
  const [clickedGloss, setClickedGloss] = useState<Set<string>>(
    () => new Set(),
  );
  const generationProgress = article.generationProgress;
  const startedAt =
    timestamp(generationProgress?.startedAt) ||
    timestamp(article.generationStartedAt) ||
    localGenerationStart;
  const lastProgressAt = timestamp(generationProgress?.updatedAt) || startedAt;
  const hasGeneration = generating || Boolean(article.generationStartedAt);
  const staleGeneration =
    hasGeneration &&
    Boolean(lastProgressAt && clock - lastProgressAt >= GENERATION_STALE_MS);
  const pending = hasGeneration && !staleGeneration;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const r = await fetch(`/api/articles/${initial.id}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!r.ok) throw new Error("无法查询文章状态");
      const data = (await r.json()) as ArticleDetail;
      setArticle(data);
      setProgressError("");
      if (data.generationStartedAt) observedServerGeneration.current = true;
      const savedNewVersion = Boolean(
        data.version &&
        data.version.id !== generationVersionBeforeRequest.current &&
        !data.generationStartedAt &&
        !data.generationError,
      );
      const recordedFailure = Boolean(
        observedServerGeneration.current &&
        !data.generationStartedAt &&
        data.generationError,
      );
      if (savedNewVersion) setError("");
      if ((savedNewVersion || recordedFailure) && generationRequest.current) {
        // The server can finish even if a proxy keeps the original POST open.
        terminalGeneration.current = data;
        generationRequest.current.abort("generation-finished");
      }
      return data;
    } catch {
      setProgressError(
        "暂时无法更新进度。请检查网络，生成可能仍在服务器继续。",
      );
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }, [initial.id]);
  const runGeneration = useCallback(async () => {
    if (genLock.current) return;
    genLock.current = true;
    generationVersionBeforeRequest.current = article.version?.id ?? null;
    observedServerGeneration.current = false;
    terminalGeneration.current = null;
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_STALE_MS);
    generationRequest.current = controller;
    setLocalGenerationStart(start);
    setClock(start);
    setGenerating(true);
    setError("");
    setProgressError("");
    setArticle((previous) => ({
      ...previous,
      generationStartedAt: new Date(start).toISOString(),
      generationError: null,
      generationProgress: {
        stage: "preparing",
        completed: 0,
        total: 0,
        startedAt: new Date(start).toISOString(),
        updatedAt: new Date(start).toISOString(),
      },
    }));
    const showSuccessfulVersion = (
      latest: ArticleDetail | null | undefined,
    ) => {
      if (
        latest?.version &&
        !latest.generationStartedAt &&
        !latest.generationError
      ) {
        setSettings(settingsSchema.parse(latest.version.settings));
        setView("learning");
        persist({ view: "learning" });
        setShowSettings(false);
      }
    };
    try {
      const r = await fetch(`/api/articles/${initial.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        signal: controller.signal,
      });
      const result = await r.json().catch(() => null);
      if (!r.ok && r.status !== 409)
        throw new Error(
          result?.error || "生成请求连接中断，正在查询服务器中的最新结果。",
        );
      const latest = await refresh();
      showSuccessfulVersion(latest);
    } catch (e) {
      if (controller.signal.reason === "generation-finished") {
        showSuccessfulVersion(terminalGeneration.current);
      } else {
        setError(
          controller.signal.aborted
            ? "等待响应的时间较长，正在查询服务器中的最新进度。"
            : e instanceof Error
              ? e.message
              : "生成失败，请稍后重试",
        );
        await refresh();
      }
    } finally {
      clearTimeout(timeout);
      generationRequest.current = null;
      genLock.current = false;
      setGenerating(false);
    }
  }, [initial.id, article.version?.id, settings, refresh, persist]);
  useEffect(() => {
    if (autoGenerate && !autoStarted.current) {
      autoStarted.current = true;
      window.history.replaceState(null, "", `/read/${initial.id}`);
      if (!initial.generationStartedAt)
        queueMicrotask(() => void runGeneration());
    }
  }, [autoGenerate, initial.id, initial.generationStartedAt, runGeneration]);
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, refresh]);
  useEffect(() => {
    if (!hasGeneration || !lastProgressAt) return;
    // The elapsed label ticks independently; do not reparse the entire Markdown
    // article every second just to advance a clock.
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, lastProgressAt + GENERATION_STALE_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [hasGeneration, lastProgressAt]);
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
  const stageIndex = Math.max(
    0,
    generationStages.findIndex(
      (stage) => stage.id === generationProgress?.stage,
    ),
  );
  const currentStage = generationStages[stageIndex];
  const totalBlocks = Math.max(0, Math.floor(generationProgress?.total ?? 0));
  const completedBlocks = Math.min(
    totalBlocks,
    Math.max(0, Math.floor(generationProgress?.completed ?? 0)),
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
        <section className="reader-generation-status" aria-label="生成进度">
          <div className="reader-generation-heading">
            <div role="status" aria-live="polite">
              <LoaderCircle className="spin" size={19} />
              <strong>{currentStage.description}</strong>
            </div>
            <GenerationElapsed startedAt={startedAt} />
          </div>
          <ol className="reader-generation-stages" aria-label="生成步骤">
            {generationStages.map((stage, index) => (
              <li
                key={stage.id}
                className={
                  index < stageIndex
                    ? "complete"
                    : index === stageIndex
                      ? "current"
                      : ""
                }
                aria-current={index === stageIndex ? "step" : undefined}
              >
                <span aria-hidden="true">
                  {index < stageIndex ? <Check size={12} /> : index + 1}
                </span>
                {stage.label}
              </li>
            ))}
          </ol>
          {totalBlocks > 0 && (
            <div className="reader-generation-blocks">
              <div>
                <strong>
                  已完成 {completedBlocks} / {totalBlocks} 块
                </strong>
                <span>按实际完成的内容更新</span>
              </div>
              <progress
                value={completedBlocks}
                max={totalBlocks}
                aria-label={`已完成 ${completedBlocks} 块，共 ${totalBlocks} 块`}
              />
            </div>
          )}
          {generationProgress?.message && (
            <p className="reader-generation-detail">
              {generationProgress.message}
            </p>
          )}
          <p className="reader-generation-help">
            你可以先读原文或已有学习版，刷新页面后仍可查看进度。模型耗时取决于内容长度与服务负载；长文章可先选几段体验。
          </p>
          {progressError && (
            <p className="reader-generation-connection" role="status">
              {progressError} 正在自动重试查询，请勿重复提交。
            </p>
          )}
        </section>
      )}
      {staleGeneration && (
        <section
          className="reader-generation-status reader-generation-stale"
          aria-label="生成任务状态"
        >
          <div className="reader-generation-heading">
            <strong role="status">进度较长时间没有更新</strong>
            <GenerationElapsed startedAt={startedAt} />
          </div>
          <p>
            任务可能已中断。最后记录：{currentStage.label}
            {totalBlocks
              ? `，已完成 ${completedBlocks} / ${totalBlocks} 块`
              : ""}
            。可以先检查最新状态，再决定是否重新生成。
          </p>
          {progressError && (
            <p className="reader-generation-connection">{progressError}</p>
          )}
          <div className="reader-generation-actions">
            <button className="text-button" onClick={() => void refresh()}>
              检查最新进度
            </button>
            <button
              className="text-button"
              onClick={() => {
                generationRequest.current?.abort();
                setShowSettings(true);
              }}
            >
              检查设置并重新生成
            </button>
          </div>
          <p className="reader-generation-help">
            重新生成会再次调用模型。已保存的成功版本会保留。
          </p>
        </section>
      )}
      {(error || article.generationError) && (
        <div className="error-box reader-error" role="alert">
          <AlertCircle size={17} />
          <div>
            {article.generationError || error}
            <button
              className="text-button"
              onClick={() => (pending ? void refresh() : setShowSettings(true))}
            >
              {pending ? "查看最新进度" : "检查设置并重试"}{" "}
              <ChevronRight size={14} />
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
              <strong>
                {pending
                  ? "原文已保存，学习版正在生成。"
                  : "原文已保存，学习版尚未生成。"}
              </strong>
              <p>
                {pending
                  ? "下方保留完整原文，完成后会自动显示学习版。"
                  : configured
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
