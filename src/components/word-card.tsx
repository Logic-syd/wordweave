"use client";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, Heart, Volume2, X, ChevronDown } from "lucide-react";
import type { Word, UserWord } from "@/lib/types";
export const statusLabels: Record<string, string> = {
  NEW: "初次遇见",
  LEARNING: "想学",
  KNOWN: "认识",
  IGNORED: "暂不学习",
};
const posLabels: Record<string, string> = {
  noun: "名词",
  verb: "动词",
  phrase: "短语",
  adjective: "形容词",
  adverb: "副词",
  other: "表达",
};
export function WordCard({
  word,
  context,
  onClose,
  onUpdate,
}: {
  word: Word;
  context?: { meaning: string; sentence: string };
  onClose: () => void;
  onUpdate: (user: UserWord) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const d = dialog.current;
    d?.showModal();
    return () => {
      d?.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  async function update(data: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/vocabulary/${word.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onUpdate(result);
      setMessage(
        data.favorite !== undefined
          ? data.favorite
            ? "已收藏，初次学习的词已加入待复习"
            : "已取消收藏"
          : "学习状态已保存",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  function speak() {
    if (!("speechSynthesis" in window)) {
      setMessage("当前浏览器不支持语音朗读。");
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) =>
      v.lang.toLowerCase().startsWith(word.language),
    );
    if (!voice) {
      setMessage(
        `没有可用的${word.language === "de" ? "德语" : "英语"}语音，请在设备设置中安装对应语音包。`,
      );
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.lemma);
    utterance.lang = voice.lang;
    utterance.voice = voice;
    utterance.rate = 0.85;
    utterance.onerror = () => setMessage("语音播放失败，请检查设备语音设置。");
    window.speechSynthesis.speak(utterance);
  }
  const g = word.grammar;
  return (
    <dialog
      ref={dialog}
      className="word-dialog"
      aria-labelledby="word-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="word-card">
        <div className="word-drag-handle" />
        <div className="word-topline">
          <span className="eyebrow">
            {word.language === "de" ? "DEUTSCH" : "ENGLISH"} ·{" "}
            {posLabels[word.partOfSpeech] ?? "表达"}
          </span>
          <button
            className="icon-button"
            aria-label="关闭词卡"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="word-title-row">
          <h2 id="word-title">
            {word.language === "de" &&
            word.partOfSpeech === "noun" &&
            g.article ? (
              <span className="article-gender">{g.article} </span>
            ) : null}
            {word.lemma}
          </h2>
          <button className="icon-button" aria-label="朗读词语" onClick={speak}>
            <Volume2 size={20} />
          </button>
        </div>
        {g.plural && <p className="word-form">复数 · {g.plural}</p>}
        {word.partOfSpeech === "verb" && g.infinitive && (
          <p className="word-form">
            原形 {g.infinitive} · 本句 {g.currentForm}
          </p>
        )}
        <p className="context-meaning">{context?.meaning ?? word.meaning}</p>
        <div className="word-section">
          <span className="small-label">
            {word.language === "en" ? "原文完整句子" : "自然德语例句"}
          </span>
          <p className="example-sentence">
            {context?.sentence ?? word.example}
          </p>
          {!context || context.sentence === word.example ? (
            <p className="example-translation">{word.exampleTranslation}</p>
          ) : (
            <div className="additional-example">
              <span className="small-label">再看一个例句</span>
              <p className="example-sentence">{word.example}</p>
              <p className="example-translation">{word.exampleTranslation}</p>
            </div>
          )}
        </div>
        <div className="word-section">
          <span className="small-label">表达说明</span>
          <p>{word.explanation}</p>
        </div>
        {g.note && (
          <details className="grammar-details">
            <summary>
              一点基础语法 <ChevronDown size={15} />
            </summary>
            <p>{g.note}</p>
          </details>
        )}
        {word.language === "en" && (
          <div className="category-row">
            <span className="small-label">归类</span>
            {[
              ["technical", "技术术语"],
              ["general", "通用表达"],
            ].map(([v, l]) => (
              <button
                className={`chip ${word.user?.category === v ? "selected" : ""}`}
                key={v}
                disabled={busy}
                onClick={() => void update({ category: v })}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="word-actions">
          {[
            ["LEARNING", "想学", Bookmark],
            ["KNOWN", "认识", Check],
            ["IGNORED", "暂不学习", X],
          ].map(([status, label, Icon]) => {
            const ItemIcon = Icon as typeof Bookmark;
            return (
              <button
                key={String(status)}
                disabled={busy}
                className={`word-action ${word.user?.status === status ? "selected" : ""}`}
                aria-pressed={word.user?.status === status}
                onClick={() => void update({ status })}
              >
                <ItemIcon size={17} />
                {String(label)}
              </button>
            );
          })}
        </div>
        <button
          className={`button favorite-button full ${word.user?.favorite ? "is-favorite" : ""}`}
          disabled={busy}
          aria-pressed={word.user?.favorite ?? false}
          onClick={() => void update({ favorite: !word.user?.favorite })}
        >
          <Heart
            size={17}
            fill={word.user?.favorite ? "currentColor" : "none"}
          />
          {word.user?.favorite ? "已收藏" : "收藏到生词本"}
        </button>
        <p className="review-rule">
          {word.user?.status === "KNOWN"
            ? `主动确认认识后，按 1、3、7、14、30 天间隔复习。${word.user?.dueAt ? "下次：" + new Date(word.user.dueAt).toLocaleDateString("zh-CN") : ""}`
            : "选“想学”或收藏新词后进入待复习队列；读到或读完文章，都不会自动判定掌握。"}
        </p>
        <div className="word-message" role="status">
          {message}
        </div>
      </div>
    </dialog>
  );
}
