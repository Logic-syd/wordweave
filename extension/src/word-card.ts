import type { OccurrenceView } from "../../src/lib/types";
import { button, ui } from "./ui";

export class WordCard {
  private node: HTMLElement | null = null;
  private trigger: HTMLElement | null = null;
  private selected: OccurrenceView | null = null;
  private keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.node) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };
  constructor(
    private root: ShadowRoot,
    private onClose: () => void = () => {},
  ) {
    root.addEventListener("keydown", this.keyboard as EventListener);
  }
  open(occurrence: OccurrenceView, trigger: HTMLElement) {
    this.node?.remove();
    this.selected = occurrence;
    this.trigger = trigger;
    this.render();
    this.node
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }
  close() {
    this.node?.remove();
    this.node = null;
    this.selected = null;
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    this.trigger = null;
    this.onClose();
  }
  private render() {
    const occurrence = this.selected;
    if (!occurrence) return;
    const { word } = occurrence;
    const card = ui("section", undefined, "word-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `词卡：${word.lemma}`);
    const topline = ui("div", undefined, "row between");
    const close = button("×", () => this.close(), "quiet close");
    close.setAttribute("aria-label", "关闭词卡");
    topline.append(ui("span", "ENGLISH · 语境词卡", "muted"), close);
    const heading = ui("div", undefined, "row between");
    const feedback = ui("p", "", "message");
    feedback.setAttribute("role", "status");
    const speak = button(
      "朗读",
      () => this.speak(word.lemma, feedback),
      "quiet",
    );
    heading.append(ui("h2", word.lemma), speak);
    card.append(topline, heading, ui("p", occurrence.meaning, "meaning"));
    const original = ui("section", undefined, "section");
    original.append(
      ui("span", "原文完整句子", "muted"),
      ui("p", occurrence.sentence, "sentence"),
    );
    card.append(original);
    const explanation = ui("section", undefined, "section");
    explanation.append(
      ui("span", "表达说明", "muted"),
      ui("p", word.explanation),
    );
    card.append(explanation);
    if (word.example && word.example !== occurrence.sentence) {
      const example = ui("section", undefined, "section");
      example.append(
        ui("span", "再看一个例句", "muted"),
        ui("p", word.example, "sentence"),
        ui("p", word.exampleTranslation, "muted"),
      );
      card.append(example);
    } else if (word.exampleTranslation)
      original.append(ui("p", word.exampleTranslation, "muted"));
    if (word.grammar.note) {
      const grammar = ui("details", undefined, "section");
      grammar.append(ui("summary", "一点基础语法"), ui("p", word.grammar.note));
      card.append(grammar);
    }
    card.append(feedback);
    this.node?.replaceWith(card);
    if (!card.isConnected) this.root.append(card);
    this.node = card;
  }
  private speak(text: string, feedback: HTMLElement) {
    if (!("speechSynthesis" in window)) {
      feedback.textContent = "当前浏览器不支持朗读。";
      return;
    }
    const voice = window.speechSynthesis
      .getVoices()
      .find((voice) => /^en(?:-|_)/i.test(voice.lang));
    if (!voice) {
      feedback.textContent =
        "没有可用的英语语音，请在设备设置中安装英语语音包。";
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.85;
    utterance.onerror = () => {
      feedback.textContent = "语音播放失败，请检查设备语音设置。";
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}
