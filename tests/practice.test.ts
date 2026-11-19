import { afterEach, describe, expect, it, vi } from "vitest";
import {
  materialFromWord,
  practiceSamples,
  practiceSource,
  tasksForSkill,
} from "../src/lib/practice-content";
import {
  practiceMaterialSchema,
  studyWriteSchema,
} from "../src/lib/practice-schemas";
import {
  sampleVocabulary,
  saveSamplePracticeOccurrence,
  saveSampleWord,
} from "../src/lib/sample-storage";

afterEach(() => vi.unstubAllGlobals());
describe("integrated listening and speaking content", () => {
  it("reuses all 15 authored materials with stable paragraph IDs and appropriate tasks", () => {
    expect(practiceSamples).toHaveLength(15);
    expect(new Set(practiceSamples.map((m) => m.id)).size).toBe(15);
    for (const m of practiceSamples) {
      expect(practiceMaterialSchema.safeParse(m).success).toBe(true);
      for (const p of m.paragraphs) {
        expect(practiceSource(m, p.id, "listen")).toBe(p.text);
        expect(p.text.startsWith(practiceSource(m, p.id, "dictation"))).toBe(
          true,
        );
      }
    }
    expect(tasksForSkill("listen")).toEqual(["listen", "dictation"]);
    expect(tasksForSkill("speak")).toEqual(["shadow", "retell", "oral"]);
  });
  it("rejects oversized, ambiguously mapped, or forged word-linked materials without truncating", () => {
    const m = practiceSamples[0];
    expect(
      practiceMaterialSchema.safeParse({
        ...m,
        paragraphs: [m.paragraphs[0], m.paragraphs[0]],
      }).success,
    ).toBe(false);
    expect(
      practiceMaterialSchema.safeParse({
        ...m,
        paragraphs: [{ id: "p", text: "a".repeat(16001) }],
      }).success,
    ).toBe(false);
    expect(
      studyWriteSchema.safeParse({
        kind: "materials",
        id: m.id,
        value: { ...m, wordId: "private-word" },
      }).success,
    ).toBe(false);
    expect(
      studyWriteSchema.safeParse({
        kind: "progress",
        id: "listen",
        value: { mid: m.id, pid: m.paragraphs[0].id, task: "oral", at: 1 },
      }).success,
    ).toBe(false);
  });
  it("keeps the same public sample word, status and distinct sources when practiced in both pages", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const word = sampleVocabulary()[0];
    saveSampleWord(word.id, { status: "KNOWN", favorite: true });
    const previous = sampleVocabulary().find((w) => w.id === word.id)!;
    const m = materialFromWord(word);
    expect(m.wordId).toBe(word.id);
    expect(m.paragraphs[0].text).toBe(word.example);
    const occurrence = {
      skill: "listen" as const,
      articleId: m.id,
      title: m.title,
      sourceId: "example",
      sentence: word.example,
      form: word.lemma,
      href: `/listen?word=${word.id}`,
    };
    saveSamplePracticeOccurrence(word.id, occurrence);
    saveSamplePracticeOccurrence(word.id, occurrence);
    saveSamplePracticeOccurrence(word.id, {
      ...occurrence,
      skill: "speak",
      href: `/speak?word=${word.id}`,
    });
    const after = sampleVocabulary().find((w) => w.id === word.id)!;
    expect(after.user?.status).toBe("KNOWN");
    expect(after.user?.reviewCount).toBe(previous.user?.reviewCount);
    expect(after.user?.exposureCount).toBe(previous.user!.exposureCount + 2);
    expect(after.appearances.slice(-2).map((a) => a.skill)).toEqual([
      "listen",
      "speak",
    ]);
  });
});
