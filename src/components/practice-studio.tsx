"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Headphones,
  Heart,
  Mic2,
  NotebookPen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  gradeDictation,
  selfCheckPoints,
} from "../../workbench/web/assessment.js";
import {
  materialFromWord,
  practiceQuestion,
  practiceSource,
  practiceTasks,
  tasksForSkill,
} from "@/lib/practice-content";
import {
  practiceAiGradeSchema,
  practiceGradeSchema,
  practiceHistorySchema,
  practiceMaterialSchema,
  practiceProgressSchema,
  materialResultSchema,
  type PracticeGrade,
  type PracticeHistory,
  type PracticeMaterial,
  type PracticeProgress,
  type PracticeSkill,
  type PracticeTask,
} from "@/lib/practice-schemas";
import type { PracticeState } from "@/lib/practice-store";
import type { VocabularyView, Word } from "@/lib/types";
import {
  sampleVocabulary,
  saveSampleWord,
  saveSamplePracticeOccurrence,
} from "@/lib/sample-storage";
import { WordCard } from "./word-card";
import { PracticePlayer, PracticeRecorder } from "./practice-audio";
import { useHydrated } from "./use-hydrated";

import { browserFetch } from "@/lib/browser-api";
import { practicePath } from "@/lib/learning-links";
type Props = {
  skill: PracticeSkill;
  owner: string | null;
  initialState: PracticeState;
  initialWords: VocabularyView[];
  materials: PracticeMaterial[];
  requestedMaterial?: string;
  requestedParagraph?: string;
  aiAvailable: boolean;
};
type LocalPractice = {
  progress?: PracticeProgress;
  drafts: Record<string, PracticeProgress>;
  history: PracticeHistory[];
};
const draftKey = (p: Pick<PracticeProgress, "mid" | "pid" | "task">) =>
  `${p.mid}|${p.pid}|${p.task}`;
function readLocal(key: string): LocalPractice {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    const progress = practiceProgressSchema.safeParse(value.progress);
    const drafts: Record<string, PracticeProgress> = {};
    for (const [id, draft] of Object.entries(value.drafts ?? {}).slice(-100)) {
      const parsed = practiceProgressSchema.safeParse(draft);
      if (parsed.success) drafts[id] = parsed.data;
    }
    const history = Array.isArray(value.history)
      ? value.history.slice(0, 100).flatMap((v: unknown) => {
          const p = practiceHistorySchema.safeParse(v);
          return p.success ? [p.data] : [];
        })
      : [];
    return {
      progress: progress.success ? progress.data : undefined,
      drafts,
      history,
    };
  } catch {
    return { drafts: {}, history: [] };
  }
}
async function requestJson(path: string, body?: unknown, method = "POST") {
  const response = await browserFetch(path, {
    method: body === undefined ? "GET" : method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error ?? "保存失败，请检查网络后重试。");
  return result;
}
const saveRecord = (kind: string, id: string, value: unknown) =>
  requestJson("/api/practice", { kind, id, value }, "PUT");
const announceWords = () =>
  window.dispatchEvent(new Event("wordweave:vocabulary"));

export function PracticeStudio(props: Props) {
  return useHydrated() ? (
    <Studio {...props} />
  ) : (
    <main className="page practice-page" data-skill={props.skill}>
      <h1>
        {props.skill === "listen" ? "听力 · 听懂一段" : "口语 · 开口说两句"}
      </h1>
      <p className="page-subtitle">正在找回上次的练习…</p>
    </main>
  );
}
function Studio({
  skill,
  owner,
  initialState,
  initialWords,
  materials: sourceMaterials,
  requestedMaterial,
  requestedParagraph,
  aiAvailable,
}: Props) {
  const storageKey = `wordweave.practice.v1:${owner ?? "guest"}:${skill}`;
  const [local] = useState(() => readLocal(storageKey));
  const [materials, setMaterials] = useState(() => {
    const cachedWordId = local.progress?.mid.startsWith("word:")
      ? local.progress.mid.slice(5)
      : undefined;
    const word = [...initialWords, ...sampleVocabulary()].find(
      (w) => w.id === cachedWordId,
    );
    return word && !sourceMaterials.some((m) => m.id === `word:${word.id}`)
      ? [materialFromWord(word), ...sourceMaterials]
      : sourceMaterials;
  });
  const [progress, setProgress] = useState<PracticeProgress>(() => {
    const remote = initialState.progress[skill];
    const cached =
      !remote || (local.progress?.at ?? 0) > remote.at
        ? local.progress
        : remote;
    const selected =
      materials.find((m) => m.id === (requestedMaterial ?? cached?.mid)) ??
      materials[0];
    const pid =
      selected.paragraphs.find(
        (p) =>
          p.id ===
          (requestedParagraph ??
            (selected.id === cached?.mid ? cached.pid : undefined)),
      )?.id ?? selected.paragraphs[0].id;
    const task =
      cached && tasksForSkill(skill).includes(cached.task)
        ? cached.task
        : tasksForSkill(skill)[0];
    const draft = local.drafts[draftKey({ mid: selected.id, pid, task })] as
      PracticeProgress | undefined;
    const resume =
      cached?.mid === selected.id && cached.pid === pid ? cached : draft;
    return {
      mid: selected.id,
      pid,
      task,
      answer: "",
      revealed: skill === "speak",
      bilingual: true,
      speed: 0.9,
      ...resume,
      at: resume?.at ?? Date.now(),
    };
  });
  const [history, setHistory] = useState(() => {
    const combined = new Map(
      [...local.history, ...initialState.history].map((h) => [h.id, h]),
    );
    return [...combined.values()].sort((a, b) => b.at - a.at).slice(0, 100);
  });
  const [words, setWords] = useState<Word[]>(() => [
    ...initialWords,
    ...sampleVocabulary().filter((w) => w.user),
  ]);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [feedback, setFeedback] = useState<PracticeHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState(
    owner ? "进度自动保存在本机" : "练习记录保存在这个浏览器",
  );
  const [languageFilter, setLanguageFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [wordOpen, setWordOpen] = useState(false);
  const [form, setForm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [wordMessage, setWordMessage] = useState("");
  const materialsPanel = useRef<HTMLDetailsElement>(null);
  const methodPanel = useRef<HTMLDetailsElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const localRef = useRef(local);
  const latest = useRef(progress);
  const material = materials.find((m) => m.id === progress.mid) ?? materials[0];
  const paragraph =
    material.paragraphs.find((p) => p.id === progress.pid) ??
    material.paragraphs[0];
  const source = practiceSource(material, paragraph.id, progress.task);
  const question = practiceQuestion(material, paragraph.id, progress.task);
  const paragraphIndex = material.paragraphs.findIndex(
    (p) => p.id === paragraph.id,
  );
  const otherSkill = skill === "listen" ? "speak" : "listen";
  const Icon = skill === "listen" ? Headphones : Mic2;
  const otherLink = `${practicePath(otherSkill)}?material=${encodeURIComponent(material.id)}&paragraph=${encodeURIComponent(paragraph.id)}`;

  useEffect(() => {
    latest.current = progress;
    const drafts = {
      ...localRef.current.drafts,
      [draftKey(progress)]: progress,
    };
    localRef.current = {
      progress,
      drafts: Object.fromEntries(
        Object.entries(drafts)
          .sort((a, b) => a[1].at - b[1].at)
          .slice(-100),
      ),
      history,
    };
    let stored = true;
    try {
      localStorage.setItem(storageKey, JSON.stringify(localRef.current));
    } catch {
      stored = false;
    }
    const timeout = setTimeout(() => {
      if (!owner) {
        setSaveStatus(
          stored ? "已保存在这个浏览器" : "浏览器无法保存，请允许本地存储",
        );
        return;
      }
      void saveRecord("progress", skill, progress)
        .then(() => {
          if (latest.current.at === progress.at)
            setSaveStatus("已保存在这个浏览器");
        })
        .catch(() => {
          if (latest.current.at === progress.at)
            setSaveStatus(
              stored
                ? "草稿已暂存，完整记录保存失败"
                : "保存失败，请勿关闭页面",
            );
        });
    }, 550);
    return () => clearTimeout(timeout);
  }, [progress, history, owner, skill, storageKey]);
  useEffect(() => {
    if (!owner) return;
    const flush = () => {
      void browserFetch("/api/practice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          kind: "progress",
          id: skill,
          value: latest.current,
        }),
      }).catch(() => {});
    };
    const retry = () =>
      void saveRecord("progress", skill, latest.current)
        .then(() => setSaveStatus("已保存在这个浏览器"))
        .catch(() => setSaveStatus("草稿已暂存，完整记录保存失败"));
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", retry);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", retry);
    };
  }, [owner, skill]);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const personal = owner ? await requestJson("/api/vocabulary") : [];
        if (!disposed && Array.isArray(personal))
          setWords([...personal, ...sampleVocabulary().filter((w) => w.user)]);
      } catch {
        /* Existing words remain available when offline. */
      }
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("wordweave:vocabulary", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("wordweave:vocabulary", refresh);
    };
  }, [owner]);

  function change(patch: Partial<PracticeProgress>) {
    setProgress((p) => ({ ...p, ...patch, at: Date.now() }));
  }
  function choose(
    m: PracticeMaterial,
    pid = m.paragraphs[0].id,
    task: PracticeTask = progress.task,
  ) {
    if (busyRef.current) return;
    if (methodPanel.current) methodPanel.current.open = false;
    if (materialsPanel.current?.open) {
      materialsPanel.current.open = false;
      workspace.current?.scrollIntoView({ block: "start" });
    }
    // Keep one draft per exercise locally when switching between tasks/materials.
    localRef.current.drafts[draftKey(progress)] = progress;
    const draft = localRef.current.drafts[
      draftKey({ mid: m.id, pid, task })
    ] as PracticeProgress | undefined;
    setProgress((previous) => ({
      mid: m.id,
      pid,
      task,
      answer: "",
      revealed: skill === "speak",
      bilingual: previous.bilingual,
      speed: previous.speed,
      ...draft,
      at: Date.now(),
    }));
    setFeedback(null);
    setMessage("");
    setWordOpen(false);
    // Native history keeps an explicit material link in sync without remounting
    // the exercise. Refresh must not jump back to the previous URL's material.
    window.history.replaceState(
      null,
      "",
      `${practicePath(skill)}?material=${encodeURIComponent(m.id)}&paragraph=${encodeURIComponent(pid)}`,
    );
  }
  async function persistHistory(entry: PracticeHistory) {
    if (owner) await saveRecord("history", entry.id, entry);
    setHistory((previous) =>
      [entry, ...previous.filter((h) => h.id !== entry.id)].slice(0, 100),
    );
    setFeedback(entry);
  }
  async function submit(ai = false) {
    if (busyRef.current) return;
    if (!progress.answer.trim()) {
      setMessage("先写下你听到的重点，或记录刚才说出的回答。");
      return;
    }
    if (
      progress.task === "dictation" &&
      (source.length > 2000 || progress.answer.length > 2000)
    ) {
      setMessage(
        "逐句听写最多支持 2,000 字符，请换成听懂大意，或导入更短的句子。",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    const entry: PracticeHistory = {
      id: crypto.randomUUID(),
      skill,
      mid: material.id,
      pid: paragraph.id,
      type: progress.task,
      title: material.title,
      lang: material.lang,
      answer: progress.answer.trim(),
      link: "",
      at: Date.now(),
      reference: {
        source,
        lang: material.lang,
        question,
        cues: paragraph.points ?? [],
      },
    };
    try {
      if (progress.task === "dictation")
        entry.grade = practiceGradeSchema.parse(
          gradeDictation(source, entry.answer),
        );
      await persistHistory(entry);
      change({ revealed: true });
      if (
        ai &&
        aiAvailable &&
        ["listen", "retell", "oral", "understand"].includes(progress.task)
      ) {
        const result = await requestJson("/api/practice/ai/grade", {
          lang: material.lang,
          type: progress.task,
          source,
          question,
          answer: entry.answer,
        });
        entry.grade = { ...practiceAiGradeSchema.parse(result), method: "ai" };
        await persistHistory(entry);
      }
      setMessage(
        owner
          ? "本次练习已保存。词语是否掌握，仍由你自己确认。"
          : "本次练习已保存在这个浏览器。",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "处理失败，答案已留在输入框中，可以重试。",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function selfCheck(index: number, checked: boolean) {
    if (!feedback || busyRef.current) return;
    const cues = selfCheckPoints(
      feedback.type,
      feedback.reference.source,
      feedback.lang,
      feedback.reference.cues,
    ).map((label: string) => label.slice(0, 240));
    const points = cues.map((label: string, i: number) => ({
      label,
      status: (i === index
        ? checked
          ? "met"
          : "missed"
        : feedback.grade?.method === "self"
          ? (feedback.grade.points[i]?.status ?? "missed")
          : "missed") as "met" | "missed" | "partial",
      explanation: "自己对照原文确认",
    }));
    busyRef.current = true;
    setBusy(true);
    try {
      await persistHistory({ ...feedback, grade: { method: "self", points } });
    } catch {
      setMessage("自查结果保存失败，可以重试；原答案仍然保留。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function openWord() {
    const selection = window.getSelection()?.toString().trim() ?? "";
    const fromSelection =
      selection.length <= 140 &&
      paragraph.text.includes(selection) &&
      selection.length > 0;
    setForm(fromSelection ? selection : (material.phrase ?? ""));
    setMeaning(
      fromSelection && selection !== material.phrase
        ? ""
        : (material.meaning ?? ""),
    );
    setWordMessage("");
    setWordOpen(true);
  }
  async function saveWord() {
    if (busyRef.current) return;
    if (!form.trim() || !meaning.trim()) {
      setWordMessage("填上原文中的表达和这个语境下的中文意思。");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setWordMessage("");
    try {
      const candidates = material.wordId?.startsWith("sample-")
        ? [...sampleVocabulary(), ...words]
        : words;
      const existing = candidates.find(
        (w) =>
          w.language === material.lang &&
          w.lemma.toLocaleLowerCase(material.lang) ===
            form.trim().toLocaleLowerCase(material.lang) &&
          w.meaning === meaning.trim(),
      );
      let word: Word;
      if (
        existing?.id.startsWith("sample-") &&
        material.wordId === existing.id
      ) {
        saveSampleWord(existing.id, { favorite: true });
        saveSamplePracticeOccurrence(existing.id, {
          skill,
          articleId: material.id,
          sourceId: paragraph.id,
          title: material.title,
          form: form.trim(),
          sentence: paragraph.text,
          href: `${practicePath(skill)}?word=${encodeURIComponent(existing.id)}`,
        });
        word = sampleVocabulary().find((w) => w.id === existing.id)!;
      } else {
        if (!owner)
          throw new Error("登录个人空间后，就能把这里的表达存进共用单词库。");
        word = await requestJson("/api/vocabulary", {
          skill,
          materialId: material.id,
          paragraphId: paragraph.id,
          form: form.trim(),
          meaning: meaning.trim(),
          ...(existing && !existing.id.startsWith("sample-")
            ? { vocabularyId: existing.id }
            : {}),
        });
      }
      setWords((previous) => [
        word,
        ...previous.filter((w) => w.id !== word.id),
      ]);
      setWordOpen(false);
      setSelectedWord(word);
      announceWords();
    } catch (error) {
      setWordMessage(
        error instanceof Error ? error.message : "收藏失败，请重试。",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const shownMaterials = materials.filter(
    (m) => languageFilter === "all" || m.lang === languageFilter,
  );
  const recent = history.filter((h) => h.skill === skill).slice(0, 5);
  const shelf = words
    .filter((w) => w.language === material.lang && w.user?.status !== "IGNORED")
    .slice(0, 4);
  return (
    <main className="page practice-page" data-skill={skill}>
      <div className="practice-entrybar">
        <h1 className="skill-kicker">
          <Icon size={17} />
          {skill === "listen" ? "听力" : "口语"}
        </h1>
        <button
          type="button"
          className="text-button"
          aria-controls="practice-materials-panel"
          onClick={() => {
            if (materialsPanel.current) {
              materialsPanel.current.open = true;
              materialsPanel.current.scrollIntoView({ block: "start" });
              materialsPanel.current
                .querySelector("summary")
                ?.focus({ preventScroll: true });
            }
          }}
        >
          换一段 <ChevronDown size={14} />
        </button>
      </div>
      <div className="practice-grid">
        <div className="practice-main-column">
          <section
            className="practice-workspace"
            ref={workspace}
            aria-label={skill === "listen" ? "听力练习" : "口语练习"}
          >
            <div className="practice-material-heading">
              <div>
                <div className="practice-meta">
                  <span>
                    {material.lang === "en" ? "英语" : "德语"}
                    {material.level && ` · ${material.level}`}
                  </span>
                  <span>{material.topic}</span>
                </div>
                <h2>{material.title}</h2>
              </div>
              <span className="paragraph-counter">
                {paragraphIndex + 1} / {material.paragraphs.length} 段
              </span>
            </div>
            <div className="practice-task-line">
              <p className="practice-instruction">
                {practiceTasks[progress.task].prompt}
              </p>
              <details className="practice-methods" ref={methodPanel}>
                <summary>
                  换个练法 <ChevronDown size={13} />
                </summary>
                <div className="practice-tabs" aria-label="练习方式">
                  {tasksForSkill(skill).map((task) => (
                    <button
                      key={task}
                      type="button"
                      aria-pressed={progress.task === task}
                      className={progress.task === task ? "selected" : ""}
                      disabled={busy}
                      onClick={() => choose(material, paragraph.id, task)}
                    >
                      {practiceTasks[task].label}
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <PracticePlayer
              key={`player:${material.id}:${paragraph.id}:${progress.task}`}
              source={source}
              language={material.lang}
              speed={progress.speed}
              onSpeed={(speed) => change({ speed })}
              speaking={skill === "speak"}
            />
            {question && (
              <div className="speaking-cue">
                <span>想象你在这个情景里</span>
                <p lang={material.lang}>{question}</p>
              </div>
            )}
            <div className="practice-transcript">
              <div className="transcript-actions">
                <button
                  type="button"
                  aria-expanded={progress.revealed}
                  onClick={() => change({ revealed: !progress.revealed })}
                >
                  <ChevronDown
                    size={16}
                    className={progress.revealed ? "expanded" : ""}
                  />
                  {progress.revealed ? "收起原文" : "展开原文"}
                </button>
                {progress.revealed && (
                  <button
                    type="button"
                    onClick={() => change({ bilingual: !progress.bilingual })}
                  >
                    {progress.bilingual ? "隐藏中文" : "显示中文"}
                  </button>
                )}
                <button
                  type="button"
                  className="save-expression"
                  onClick={openWord}
                >
                  <Heart size={15} />
                  收藏表达
                </button>
              </div>
              {progress.revealed && (
                <div className="transcript-text">
                  <p lang={material.lang}>{source}</p>
                  {progress.bilingual && paragraph.zh && (
                    <p className="transcript-translation">
                      {["shadow", "dictation"].includes(progress.task) &&
                        source !== paragraph.text && (
                          <small>整段参考译文 · </small>
                        )}
                      {paragraph.zh}
                    </p>
                  )}
                  {!paragraph.zh && progress.bilingual && (
                    <p className="transcript-translation">
                      这份材料还没有中文参考。
                    </p>
                  )}
                </div>
              )}
            </div>
            {wordOpen && (
              <form
                className="expression-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveWord();
                }}
              >
                <div className="section-heading">
                  <h3>留下这句里的好表达</h3>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="关闭收藏表单"
                    onClick={() => setWordOpen(false)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <label>
                  原文表达
                  <input
                    maxLength={140}
                    value={form}
                    onChange={(e) => setForm(e.target.value)}
                    placeholder="原文中实际出现的词或短语"
                  />
                </label>
                <label>
                  在这里的中文意思
                  <input
                    maxLength={300}
                    value={meaning}
                    onChange={(e) => setMeaning(e.target.value)}
                    placeholder="把语境一起记住"
                  />
                </label>
                <button disabled={busy} className="button favorite-button">
                  <Heart size={15} />
                  收藏到共用单词库
                </button>
                {wordMessage && <p role="alert">{wordMessage}</p>}
              </form>
            )}
            {skill === "speak" && (
              <PracticeRecorder
                key={`recorder:${material.id}:${paragraph.id}:${progress.task}`}
              />
            )}
            <form
              className="practice-answer"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label htmlFor="practice-answer">
                {skill === "listen"
                  ? progress.task === "dictation"
                    ? "把听到的这句写下来"
                    : "我听到的重点"
                  : "记下我刚才说的话"}
                <small>
                  {skill === "listen"
                    ? "英语尽量用英文；德语也可以先用中文概括。"
                    : "可只记关键句；AI 反馈会根据文字回答，不评价发音。"}
                </small>
              </label>
              <textarea
                id="practice-answer"
                value={progress.answer}
                onChange={(e) => change({ answer: e.target.value })}
                rows={4}
                maxLength={progress.task === "dictation" ? 2000 : 8000}
                placeholder={
                  skill === "listen"
                    ? "先不看原文，试着写下听到的内容…"
                    : "刚才我想表达的是…"
                }
              />
              <div className="practice-submit">
                <button
                  type="submit"
                  className="button skill-primary"
                  disabled={busy}
                >
                  <Check size={17} />
                  {busy
                    ? "正在处理…"
                    : progress.task === "dictation"
                      ? "保存并对照听写"
                      : "保存，自己对照"}
                </button>
                {!["shadow", "dictation"].includes(progress.task) && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy || !aiAvailable}
                    onClick={() => void submit(true)}
                  >
                    <Sparkles size={16} />
                    保存并获取 AI 反馈
                  </button>
                )}
              </div>
              {!aiAvailable &&
                !["shadow", "dictation"].includes(progress.task) && (
                  <p className="practice-hint">
                    {owner
                      ? "在「我的 API」填写自己的 Key 后可用 AI 反馈。"
                      : "登录后可使用已配置的 AI 反馈。"}
                  </p>
                )}
            </form>
            {message && (
              <p className="practice-notice" role="status">
                {message}
              </p>
            )}
            {feedback && (
              <Feedback
                entry={feedback}
                disabled={busy}
                onCheck={(index, checked) => void selfCheck(index, checked)}
              />
            )}
            <div className="practice-bottom">
              <button
                type="button"
                disabled={busy || paragraphIndex === 0}
                onClick={() =>
                  choose(material, material.paragraphs[paragraphIndex - 1].id)
                }
              >
                <ArrowLeft size={16} />
                上一段
              </button>
              <span role="status">{saveStatus}</span>
              <button
                type="button"
                disabled={
                  busy || paragraphIndex === material.paragraphs.length - 1
                }
                onClick={() =>
                  choose(material, material.paragraphs[paragraphIndex + 1].id)
                }
              >
                下一段
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
          <div className="practice-after-task">
            <Link href={otherLink} className="practice-crosslink">
              {skill === "listen" ? (
                <Mic2 size={15} />
              ) : (
                <Headphones size={15} />
              )}
              这段也拿来{skill === "listen" ? "说" : "听"}
              <ArrowRight size={14} />
            </Link>
          </div>
          {recent.length > 0 && (
            <section className="practice-history">
              <div className="section-heading">
                <h2>最近练过</h2>
                <span>保存的是练习，不自动判定掌握</span>
              </div>
              {recent.map((h) => (
                <details key={h.id}>
                  <summary>
                    <span>
                      {practiceTasks[h.type].label} · {h.title}
                    </span>
                    <time>{new Date(h.at).toLocaleDateString("zh-CN")}</time>
                  </summary>
                  <p className="history-answer">{h.answer}</p>
                  {h.grade && <GradeResult grade={h.grade} />}
                  <Link
                    href={`${practicePath(skill)}?material=${encodeURIComponent(h.mid)}&paragraph=${encodeURIComponent(h.pid)}`}
                  >
                    回到这一段 <ArrowRight size={13} />
                  </Link>
                </details>
              ))}
            </section>
          )}
        </div>
        <details
          id="practice-materials-panel"
          className="practice-tools"
          ref={materialsPanel}
        >
          <summary>
            换一段练习 · 共用单词库 <ChevronDown size={15} />
          </summary>
          <aside className="practice-aside">
            <section className="practice-materials">
              <div className="section-heading">
                <h2>换一段练习</h2>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="导入练习材料"
                  onClick={() => setImportOpen(true)}
                >
                  <Plus size={19} />
                </button>
              </div>
              <p>日常、工作和你自己的材料</p>
              <div className="material-language-tabs">
                {[
                  ["all", "全部"],
                  ["en", "英语"],
                  ["de", "德语"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={languageFilter === value}
                    onClick={() => setLanguageFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="material-options">
                {shownMaterials.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    disabled={busy}
                    className={m.id === material.id ? "selected" : ""}
                    aria-pressed={m.id === material.id}
                    onClick={() => choose(m)}
                  >
                    <span>{m.title}</span>
                    <small>
                      {m.lang === "de" ? `德语 ${m.level}` : "英语"} ·{" "}
                      {m.paragraphs.length} 段{m.wordId ? " · 单词库" : ""}
                    </small>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="button import-material"
                onClick={() => setImportOpen(true)}
              >
                <Plus size={15} />
                导入自己的材料
              </button>
            </section>
            <section className="practice-word-shelf">
              <div className="section-heading">
                <h2>
                  <NotebookPen size={17} />
                  共用单词库
                </h2>
                <Link href="/vocabulary" aria-label="打开单词库">
                  <ArrowRight size={17} />
                </Link>
              </div>
              <p>阅读里存过的，也能拿来{skill === "listen" ? "听" : "说"}。</p>
              {shelf.length ? (
                shelf.map((w) => (
                  <div key={w.id} className="practice-shelf-word">
                    <button type="button" onClick={() => setSelectedWord(w)}>
                      <strong>{w.lemma}</strong>
                      <span>{w.meaning}</span>
                    </button>
                    <Link
                      href={`${practicePath(skill)}?word=${encodeURIComponent(w.id)}`}
                      aria-label={`${skill === "listen" ? "听" : "说"} ${w.lemma}`}
                    >
                      <Icon size={16} />
                    </Link>
                  </div>
                ))
              ) : (
                <p className="shelf-empty">
                  把没听懂、说不出的表达收藏到这里，下次接着练。
                </p>
              )}
              <Link className="shelf-footer" href="/vocabulary">
                查看全部词条 <ArrowRight size={14} />
              </Link>
            </section>
          </aside>
        </details>
      </div>
      {importOpen && (
        <ImportMaterial
          owner={owner}
          aiAvailable={aiAvailable}
          onClose={() => setImportOpen(false)}
          onSave={(m) => {
            setMaterials((previous) => [
              m,
              ...previous.filter((p) => p.id !== m.id),
            ]);
            choose(m);
            setImportOpen(false);
          }}
        />
      )}
      {selectedWord && (
        <WordCard
          key={selectedWord.id}
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          onUpdate={(user) => {
            setSelectedWord((w) => (w ? { ...w, user } : null));
            setWords((previous) =>
              previous.map((w) =>
                w.id === selectedWord.id ? { ...w, user } : w,
              ),
            );
            announceWords();
          }}
        />
      )}
    </main>
  );
}

function GradeResult({ grade }: { grade: PracticeGrade }) {
  if (grade.method === "dictation")
    return (
      <div className="dictation-result">
        <strong>听写对照 · {grade.score}%</strong>
        <p>
          漏词 {grade.missing} · 多写 {grade.extra} · 替换 {grade.substitutions}
          （忽略大小写和标点）
        </p>
        {grade.differences.map((d, i) => (
          <div className="dictation-difference" key={i}>
            <span>原句：{d.expected || "（无）"}</span>
            <span>我写：{d.actual || "（漏写）"}</span>
          </div>
        ))}
      </div>
    );
  return (
    <div className="grade-result">
      {grade.points.map((p, i) => (
        <div key={i}>
          <span className={`point-status ${p.status}`}>
            {p.status === "met"
              ? "已覆盖"
              : p.status === "partial"
                ? "部分覆盖"
                : "再留意"}
          </span>
          <strong>{p.label}</strong>
          <p>{p.explanation}</p>
        </div>
      ))}
      {"correction" in grade && (
        <>
          <p>
            <strong>可以调整：</strong>
            {grade.correction}
          </p>
          <p>
            <strong>参考表达：</strong>
            {grade.example}
          </p>
          {grade.review.map((r, i) => (
            <p key={i}>
              <strong>{r.text}</strong> · {r.reason}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
function Feedback({
  entry,
  disabled,
  onCheck,
}: {
  entry: PracticeHistory;
  disabled: boolean;
  onCheck: (index: number, checked: boolean) => void;
}) {
  const self = !entry.grade || entry.grade.method === "self";
  return (
    <section className="practice-feedback" aria-label="本次练习反馈">
      <h3>
        {self
          ? "回头对照一下"
          : entry.grade?.method === "dictation"
            ? "看清楚漏听在哪里"
            : "本次文字回答的 AI 反馈"}
      </h3>
      <p className="feedback-answer">我的回答：{entry.answer}</p>
      {self ? (
        <>
          <p>这些要点，我表达到了吗？勾选只记录本次自查。</p>
          {selfCheckPoints(
            entry.type,
            entry.reference.source,
            entry.lang,
            entry.reference.cues,
          ).map((label: string, i: number) => (
            <label className="self-check-point" key={i}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={
                  entry.grade?.method === "self" &&
                  entry.grade.points[i]?.status === "met"
                }
                onChange={(e) => onCheck(i, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </>
      ) : (
        entry.grade && <GradeResult grade={entry.grade} />
      )}
    </section>
  );
}
function ImportMaterial({
  owner,
  aiAvailable,
  onClose,
  onSave,
}: {
  owner: string | null;
  aiAvailable: boolean;
  onClose: () => void;
  onSave: (m: PracticeMaterial) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [lang, setLang] = useState<"en" | "de">("en");
  const [level, setLevel] = useState<"A1" | "A2" | "B1">("A2");
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<PracticeMaterial | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const d = dialog.current;
    d?.showModal();
    return () => {
      d?.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  async function submit() {
    if (lock.current) return;
    if (!owner) {
      setError("请先登录个人空间，再导入自己的材料。");
      return;
    }
    const paragraphs = text
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean);
    if (!title.trim() || !text.trim()) {
      setError("请填写标题和原文。");
      return;
    }
    if (text.length > 16000 || paragraphs.length > 6) {
      setError(
        "每份材料最多 16,000 字符、6 段。请分成几份导入，内容不会被截断。",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let m = practiceMaterialSchema.parse({
        id: saved?.id ?? `custom:${crypto.randomUUID()}`,
        title,
        lang,
        level: lang === "de" ? level : "",
        topic: "我的材料",
        at: Date.now(),
        paragraphs: paragraphs.map((text, i) => ({
          id: `p${i + 1}`,
          text,
          zh: "",
        })),
      });
      // Persist source first. A failed model call can never erase imported text.
      await saveRecord("materials", m.id, m);
      setSaved(m);
      if (ai && aiAvailable) {
        const result = materialResultSchema.parse(
          await requestJson("/api/practice/ai/material", {
            lang,
            level: m.level,
            paragraphs: m.paragraphs.map((p) => p.text),
          }),
        );
        if (
          result.paragraphs.length !== m.paragraphs.length ||
          result.paragraphs.some((p, i) => p.index !== i)
        )
          throw new Error(
            "生成的段落对应关系有误，原文已保存。可以重试或直接开始练习。",
          );
        m = {
          ...m,
          paragraphs: m.paragraphs.map((p, i) => ({
            ...p,
            ...result.paragraphs[i],
          })),
        };
        await saveRecord("materials", m.id, m);
      }
      onSave(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败，输入仍然保留。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      className="practice-import-dialog"
      ref={dialog}
      aria-labelledby="import-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="section-heading">
          <h2 id="import-title">用自己的材料练习</h2>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            aria-label="关闭导入"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p>听力和口语共用这份材料。粘贴原文，或选择 TXT / Markdown 文件。</p>
        <fieldset disabled={busy}>
          <label>
            标题
            <input
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="import-language">
            <label>
              语言
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as "en" | "de")}
              >
                <option value="en">英语</option>
                <option value="de">德语</option>
              </select>
            </label>
            {lang === "de" && (
              <label>
                程度
                <select
                  value={level}
                  onChange={(e) =>
                    setLevel(e.target.value as "A1" | "A2" | "B1")
                  }
                >
                  <option>A1</option>
                  <option>A2</option>
                  <option>B1</option>
                </select>
              </label>
            )}
          </div>
          <label>
            选择文本文件
            <input
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 65000) {
                  setError("文件过大，请分成小段导入。");
                  return;
                }
                try {
                  const content = new TextDecoder("utf-8", {
                    fatal: true,
                  }).decode(await file.arrayBuffer());
                  setText(content);
                  if (!title)
                    setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 100));
                  setError("");
                } catch {
                  setError(
                    "无法读取文件，请使用 UTF-8 编码的 TXT 或 Markdown。",
                  );
                }
              }}
            />
          </label>
          <label>
            原文
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="每段之间留一个空行。原文作为文本保存。"
            />
          </label>
          <p className="practice-hint">
            {text.length.toLocaleString()} / 16,000 字符 · 最多 6 段
          </p>
          {aiAvailable && (
            <label className="self-check-point">
              <input
                type="checkbox"
                checked={ai}
                onChange={(e) => setAi(e.target.checked)}
              />
              <span>使用 AI 补充中文和练习题（使用自己的 API 额度）</span>
            </label>
          )}
        </fieldset>
        {error && (
          <p className="practice-notice error" role="alert">
            {error}
          </p>
        )}
        <div className="practice-submit">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "正在保存材料…" : "保存并开始练习"}
          </button>
          {saved && error && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => onSave(saved)}
            >
              使用已保存的原文
            </button>
          )}
        </div>
        {!owner && (
          <Link href="/login">
            登录个人空间 <ArrowRight size={14} />
          </Link>
        )}
      </form>
    </dialog>
  );
}
