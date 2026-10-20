import type { OccurrenceView, UserWord } from "../../src/lib/types";
import { sendMessage, type WordPatch } from "./protocol";
import { button, ui } from "./ui";

const statusNames: Record<string, string> = {
  NEW: "初次遇见",
  LEARNING: "想学",
  KNOWN: "认识",
  IGNORED: "暂不学习",
};

export class WordCard {
  private node: HTMLElement | null = null;
  private trigger: HTMLElement | null = null;
  private selected: OccurrenceView | null = null;
  private busy = false;
  private keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.node) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };
  constructor(
    private root: ShadowRoot,
    private updated: (id: string, user: UserWord) => void,
    private onClose: () => void = () => {},
  ) {
    root.addEventListener("keydown", this.keyboard as EventListener);
  }
  open(occurrence: OccurrenceView, trigger: HTMLElement) {
    this.node?.remove();
    this.selected = occurrence;
    this.trigger = trigger;
    this.busy = false;
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
    const category = ui("div", undefined, "row section");
    category.append(ui("span", "归类", "muted"));
    for (const [value, label] of [
      ["technical", "技术术语"],
      ["general", "通用表达"],
    ] as const)
      category.append(
        button(
          label,
          () => void this.update({ category: value }, feedback),
          word.user?.category === value ? "selected" : "",
        ),
      );
    card.append(category);
    category.querySelectorAll("button").forEach((button) => {
      button.dataset.mutation = "";
    });
    const actions = ui("div", undefined, "row actions");
    for (const [status, label] of [
      ["LEARNING", "想学"],
      ["KNOWN", "认识"],
      ["IGNORED", "暂不学习"],
    ] as const)
      actions.append(
        button(
          label,
          () => void this.update({ status }, feedback),
          word.user?.status === status ? "selected" : "",
        ),
      );
    actions.append(
      button(
        word.user?.favorite ? "♥ 已收藏" : "♡ 收藏",
        () => void this.update({ favorite: !word.user?.favorite }, feedback),
        word.user?.favorite ? "selected" : "",
      ),
    );
    actions.querySelectorAll("button").forEach((button) => {
      button.dataset.mutation = "";
    });
    card.append(
      actions,
      ui(
        "p",
        `${statusNames[word.user?.status ?? "NEW"] ?? "初次遇见"} · 保存在本机插件`,
        "saved",
      ),
      feedback,
    );
    this.node?.replaceWith(card);
    if (!card.isConnected) this.root.append(card);
    this.node = card;
  }
  private async update(patch: WordPatch, feedback: HTMLElement) {
    if (this.busy || !this.selected) return;
    const occurrence = this.selected;
    const focusLabel = this.root.activeElement?.textContent;
    this.busy = true;
    feedback.textContent = "保存中…";
    this.node
      ?.querySelectorAll<HTMLButtonElement>("button[data-mutation]")
      .forEach((button) => {
        button.disabled = true;
      });
    try {
      const user = await sendMessage<UserWord>({
        type: "ww:word:update",
        id: occurrence.vocabularyId,
        patch,
      });
      occurrence.word.user = user;
      this.updated(occurrence.vocabularyId, user);
      if (this.selected === occurrence) {
        this.render();
        const nextFocus = Array.from(
          this.node?.querySelectorAll("button") ?? [],
        ).find(
          (button) =>
            button.textContent === focusLabel ||
            (patch.favorite !== undefined &&
              button.textContent?.includes("收藏")),
        );
        nextFocus?.focus({ preventScroll: true });
        const message = this.node?.querySelector<HTMLElement>(".message");
        if (message) message.textContent = "已保存到本机收藏。";
      }
    } catch (error) {
      feedback.textContent =
        error instanceof Error ? error.message : "保存失败，请稍后重试。";
      feedback.classList.add("error");
    } finally {
      this.busy = false;
      this.node
        ?.querySelectorAll<HTMLButtonElement>("button[data-mutation]")
        .forEach((button) => {
          button.disabled = false;
        });
    }
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
