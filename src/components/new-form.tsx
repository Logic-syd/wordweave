"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  FileText,
  Upload,
  ArrowRight,
  Sparkles,
  Info,
  Braces,
  Sprout,
} from "lucide-react";
import { MAX_INPUT, settingsSchema, type Settings } from "@/lib/schemas";
import { useHydrated } from "./use-hydrated";
import { SettingsFields } from "./settings-fields";
export function NewForm({
  mode,
  configured,
  initialSettings,
  dueWords,
}: {
  mode: "tech" | "german";
  configured: boolean;
  initialSettings: Settings;
  dueWords: string[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [settings, setSettings] = useState(initialSettings);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [importGerman, setImportGerman] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const key = useRef(crypto.randomUUID());
  const upload = useRef<HTMLInputElement>(null);
  const tech = mode === "tech";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setError("");
    if ((tech || importGerman) && !text.trim()) {
      setError("请先输入文章正文。");
      return;
    }
    if (text.length > MAX_INPUT) {
      setError("正文最多 40,000 个字符，请拆分成独立文章。");
      return;
    }
    if (settings.reviewOnly && !dueWords.length) {
      setError("目前没有待复习词。先读一篇演示文章，在词卡中选择“想学”。");
      return;
    }
    if (
      settings.requestedWords.split(/[,，;；\n]/).filter((s) => s.trim())
        .length > settings.newWordCount &&
      !settings.reviewOnly
    ) {
      setError("指定词数量不能超过每篇新词数。");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key.current,
        },
        body: JSON.stringify({
          title:
            title.trim() ||
            (tech ? "未命名技术文章" : `关于${settings.topic}的德语短文`),
          text,
          sourceUrl,
          mode,
          settings: settingsSchema.parse(settings),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(`/read/${data.id}${configured ? "?generate=1" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      submitting.current = false;
      setBusy(false);
    }
  }
  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      setError("请选择 UTF-8 编码的 TXT 或 Markdown 文件。");
      return;
    }
    if (file.size > 200000) {
      setError("文件过大；正文最多 40,000 个字符。");
      return;
    }
    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (content.length > MAX_INPUT)
        throw new Error("正文最多 40,000 个字符，请拆分文章。");
      setText(content);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "无法读取 UTF-8 内容，请检查文件编码。"
          : e instanceof Error
            ? e.message
            : "文件读取失败",
      );
    }
  }
  return (
    <main className="page create-page">
      <Link href="/" className="back-link">
        ← 返回学习空间
      </Link>
      <div className="create-heading">
        <span className={`small-icon ${tech ? "rose" : "sage"}`}>
          {tech ? <Braces size={24} /> : <Sprout size={24} />}
        </span>
        <div>
          <span className="eyebrow">
            {tech ? "TECHNICAL ENGLISH" : "DEUTSCH IM ALLTAG"}
          </span>
          <h1>
            {tech ? "把好文章，变成学习材料。" : "今天，想读一个什么故事？"}
          </h1>
        </div>
      </div>
      <p className="page-subtitle">
        {tech
          ? "中文帮你理解，英文带你学会表达。标题、列表、链接与代码都会保留。"
          : "在中文故事里遇见德语词，也可以对照阅读自然的德语全文。"}
      </p>
      {!configured && (
        <div className="notice">
          <Info size={19} />
          <div>
            尚未配置模型 API。
            {tech
              ? "你可以先保存、阅读原文；生成学习版需配置服务端环境变量。"
              : "原创生成需要 API；你也可以导入原文，或先体验演示故事。"}{" "}
            <Link href="/library">去读演示文章 →</Link>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="create-layout">
        <div className="form-panel">
          <div className="section-heading">
            <h2>
              <FileText size={19} />
              {tech ? "导入英文文章" : "你的故事"}
            </h2>
            {!tech && (
              <div className="segmented small">
                <button
                  type="button"
                  className={!importGerman ? "selected" : ""}
                  onClick={() => setImportGerman(false)}
                >
                  生成短文
                </button>
                <button
                  type="button"
                  className={importGerman ? "selected" : ""}
                  onClick={() => setImportGerman(true)}
                >
                  导入德语
                </button>
              </div>
            )}
          </div>
          <label>
            文章标题{" "}
            <span className="muted normal">{tech ? "" : "（可选）"}</span>
            <input
              disabled={busy || !hydrated}
              required={tech}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={
                tech
                  ? "例如：理解 React 的状态更新"
                  : "留空，让故事自己起一个名字"
              }
            />
          </label>
          {(tech || importGerman) && (
            <>
              <label>
                来源网址{" "}
                <span className="muted normal">
                  （可选，仅保存来源，不抓取网页）
                </span>
                <input
                  type="url"
                  disabled={busy || !hydrated}
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://…"
                  maxLength={2000}
                />
              </label>
              <div className="label-row">
                <label htmlFor="article-text">
                  {tech ? "英文正文" : "德语原文"}
                </label>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || !hydrated}
                  onClick={() => upload.current?.click()}
                >
                  <Upload size={15} />
                  上传 TXT / Markdown
                </button>
                <input
                  ref={upload}
                  type="file"
                  disabled={busy || !hydrated}
                  hidden
                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                  onChange={(e) => {
                    void loadFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <textarea
                id="article-text"
                disabled={busy || !hydrated}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  tech
                    ? "把你想读的英文文章粘贴到这里…\n\n支持 Markdown，包括代码块、行内代码、标题、列表与链接。"
                    : "粘贴想读的德语短文…"
                }
                rows={14}
              />
              <div className="input-footer">
                <span>仅支持文本，不解析 PDF</span>
                <span className={text.length > MAX_INPUT ? "error-text" : ""}>
                  {text.length.toLocaleString()} / 40,000 字符
                </span>
              </div>
            </>
          )}
          {!tech && !importGerman && (
            <div className="story-intro">
              <span className="story-quote">“</span>
              <p>
                一段故事，几个新词。
                <br />
                从一杯咖啡、一次通勤，
                <br />
                或者任何让你好奇的小事开始。
              </p>
              <span>原创内容会标记为「生成短文」</span>
            </div>
          )}
        </div>
        <aside className="form-panel settings-panel">
          <h2>这一次，怎么读？</h2>
          <SettingsFields
            mode={mode}
            value={settings}
            onChange={setSettings}
            disabled={busy || !hydrated}
          />
          {!tech && (
            <div className="review-summary">
              <strong>让旧词再见一面</strong>
              {dueWords.length ? (
                <p>
                  本次可带入复习：{dueWords.join("、")}
                  。生成后只记录实际覆盖的词。
                </p>
              ) : (
                <p>
                  还没有待复习词。读文章时选“想学”，它们就会在新故事里再出现。
                </p>
              )}
            </div>
          )}
          <div className="generation-note">
            <Sparkles size={16} />
            <p>
              生成会调用你的模型
              API。语言内容可能有误，请结合原文判断；调整设置后可重新生成。
            </p>
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary full"
            type="submit"
            disabled={
              busy || !hydrated || (!configured && !tech && !importGerman)
            }
          >
            {busy ? (
              "正在保存…"
            ) : configured ? (
              <>
                {tech || importGerman ? "保存并生成学习版" : "生成我的故事"}
                <ArrowRight size={17} />
              </>
            ) : tech || importGerman ? (
              "保存原文"
            ) : (
              "配置 API 后即可生成"
            )}
          </button>
        </aside>
      </form>
    </main>
  );
}
