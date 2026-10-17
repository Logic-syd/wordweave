import { describe, expect, it } from "vitest";
import {
  generationSchema,
  importSchema,
  settingsSchema,
  termSchema,
} from "../src/lib/schemas";
import { validateTargets } from "../src/lib/generation";
const term = termSchema.parse({
  id: "a",
  lemma: "Bahnhof",
  partOfSpeech: "noun",
  meaning: "火车站",
  grammar: { article: "der", plural: "die Bahnhöfe" },
  explanation: "火车站",
  example: "Ich bin am Bahnhof.",
  exampleTranslation: "我在火车站。",
});
const data = {
  title: "通勤",
  terms: [term],
  paragraphs: [
    {
      id: "p0001",
      original: "Ich bin am Bahnhof.",
      segments: [
        {
          type: "term" as const,
          text: "Bahnhof",
          termId: "a",
          meaning: "火车站",
          sentence: "Ich bin am Bahnhof.",
        },
      ],
    },
  ],
};
describe("structured output and actual coverage", () => {
  it("rejects invalid model fields and empty/oversized imports", () => {
    expect(
      generationSchema.safeParse({ title: "x", terms: [], paragraphs: [] })
        .success,
    ).toBe(false);
    expect(
      generationSchema.safeParse({
        ...data,
        terms: [{ ...term, partOfSpeech: "garbage" }],
      }).success,
    ).toBe(false);
    expect(
      importSchema.safeParse({
        title: "x",
        mode: "tech",
        text: "  ",
        settings: {},
      }).success,
    ).toBe(false);
    expect(
      importSchema.safeParse({
        title: "x",
        mode: "tech",
        text: "x".repeat(40001),
        settings: {},
      }).success,
    ).toBe(false);
  });
  it("counts only terms actually annotated and reports uncovered review words", () => {
    const result = generationSchema.parse({
      ...data,
      terms: [term, { ...term, id: "unused", lemma: "Zug" }],
    });
    const coverage = validateTargets(result, settingsSchema.parse({}), "tech", [
      { id: "review-missing", lemma: "Kasse" },
    ]);
    expect(coverage.newWords).toEqual(["Bahnhof"]);
    expect(coverage.missing).toEqual(["Kasse"]);
  });
  it("enforces German new-word counts, review-only, noun grammar and requested coverage", () => {
    expect(() =>
      validateTargets(
        generationSchema.parse(data),
        settingsSchema.parse({ newWordCount: 3 }),
        "german",
        [],
      ),
    ).toThrow(/实际覆盖/);
    const result = generationSchema.parse({
      ...data,
      terms: [{ ...term, reviewVocabularyId: "review-1" }],
    });
    const coverage = validateTargets(
      result,
      settingsSchema.parse({ reviewOnly: true }),
      "german",
      [{ id: "review-1", lemma: "Bahnhof" }],
    );
    expect(coverage.newWords).toHaveLength(0);
    expect(coverage.reviewWords).toEqual(["Bahnhof"]);
    expect(() =>
      validateTargets(
        {
          ...result,
          terms: [
            { ...result.terms[0], grammar: { ...term.grammar, article: "" } },
          ],
        },
        settingsSchema.parse({ reviewOnly: true }),
        "german",
        [{ id: "review-1", lemma: "Bahnhof" }],
      ),
    ).toThrow(/冠词/);
  });
});
