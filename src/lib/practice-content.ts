import { samples } from "../../workbench/web/content.js";
import {
  practiceMaterialSchema,
  type PracticeMaterial,
  type PracticeSkill,
  type PracticeTask,
} from "./practice-schemas";
import type { Word } from "./types";

// Keep one set of authored materials for the integrated website and the legacy workbench.
export const practiceSamples: PracticeMaterial[] = samples.map((m) =>
  practiceMaterialSchema.parse(m),
);
export const practiceTasks: Record<
  PracticeTask,
  { label: string; prompt: string }
> = {
  listen: { label: "听懂大意", prompt: "先听一遍，用自己的话写下重点。" },
  dictation: { label: "逐句听写", prompt: "听一句，写一句。提交后逐词对照。" },
  understand: { label: "理解练习", prompt: "回答材料里的这个问题。" },
  shadow: { label: "跟读", prompt: "先听原声，再跟着说。留意重音与停顿。" },
  retell: { label: "复述", prompt: "收起原文，用自己的话说出重点。" },
  oral: { label: "情景表达", prompt: "把话说出口，再记下自己的回答。" },
};
export const tasksForSkill = (skill: PracticeSkill): PracticeTask[] =>
  skill === "listen" ? ["listen", "dictation"] : ["shadow", "retell", "oral"];
export function practiceSource(
  material: PracticeMaterial,
  paragraphId: string,
  task: PracticeTask,
) {
  const p =
    material.paragraphs.find((p) => p.id === paragraphId) ??
    material.paragraphs[0];
  if (task === "shadow" || task === "dictation") {
    const segments = new Intl.Segmenter(material.lang, {
      granularity: "sentence",
    }).segment(p.text);
    return Array.from(segments)[0]?.segment.trim() ?? p.text;
  }
  return p.text;
}
export function practiceQuestion(
  m: PracticeMaterial,
  paragraphId: string,
  task: PracticeTask,
) {
  const p = m.paragraphs.find((p) => p.id === paragraphId) ?? m.paragraphs[0];
  if (task === "oral")
    return (
      p.oral ??
      m.oral ??
      (m.lang === "de"
        ? "Was würdest du in einer ähnlichen Situation sagen?"
        : "What would you say in a similar situation?")
    );
  if (task === "understand")
    return (
      p.question ?? m.question ?? "What is the main point of this paragraph?"
    );
  return "";
}
export function materialFromWord(word: Word): PracticeMaterial {
  return {
    id: `word:${word.id}`,
    wordId: word.id,
    title: `练一句 · ${word.lemma}`.slice(0, 100),
    lang: word.language === "de" ? "de" : "en",
    level: word.language === "de" ? "A2" : "",
    topic: "我的单词库",
    paragraphs: [
      { id: "example", text: word.example, zh: word.exampleTranslation },
    ],
    phrase: word.lemma.slice(0, 140),
    meaning: word.meaning,
    oral:
      word.language === "de"
        ? `Benutze „${word.lemma}“ in einer eigenen Situation.`
        : `Use “${word.lemma}” to describe a situation of your own.`,
  };
}
