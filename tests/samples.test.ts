import { afterEach, describe, expect, it, vi } from "vitest";
import { getSample, listSamples } from "../src/lib/samples";
import {
  englishProseWordCount,
  parseSource,
  sourceContainsSentence,
} from "../src/lib/markdown";
import { longReadDemos } from "../src/lib/long-reads";
import { termSchema } from "../src/lib/schemas";
import {
  sampleShelf,
  sampleVocabulary,
  sampleWithProgress,
  saveSampleProgress,
  saveSampleWord,
} from "../src/lib/sample-storage";

afterEach(() => vi.unstubAllGlobals());
describe("public sample catalog", () => {
  it("contains twelve separate English and German articles with aligned original paragraphs and real word coverage", () => {
    expect(listSamples()).toHaveLength(12);
    expect(listSamples("tech")).toHaveLength(8);
    expect(listSamples("german")).toHaveLength(4);
    for (const summary of listSamples()) {
      const article = getSample(summary.id)!;
      const original = parseSource(article.sourceText);
      expect(article.version!.paragraphs).toHaveLength(original.length);
      article.version!.paragraphs.forEach((p, i) => {
        expect(p.original).toBe(original[i].original);
        expect(p.sourceId).toBe(original[i].id);
        const rendered = p.segments.map((s) => s.text).join("");
        if (original[i].kind === "code")
          expect(rendered).toBe(original[i].original);
        for (const protectedText of Object.values(original[i].protected))
          expect(rendered).toContain(protectedText);
      });
      for (const o of article.version!.occurrences) {
        const source = original.find((p) => p.id === o.sourceId)!;
        expect(
          sourceContainsSentence(source.original, o.sentence),
          `${article.title}: ${o.word.lemma} original`,
        ).toBe(true);
        expect(
          sourceContainsSentence(o.sentence, o.form),
          `${article.title}: ${o.form} form`,
        ).toBe(true);
        if (article.language === "de" && o.word.partOfSpeech === "noun") {
          expect(["der", "die", "das"]).toContain(o.word.grammar.article);
          expect(o.word.grammar.plural).toBeTruthy();
        }
      }
      expect(article.version!.coverage.newWords.length).toBe(
        new Set(article.version!.occurrences.map((o) => o.word.lemma)).size,
      );
    }
    expect(new Set(listSamples("german").map((s) => s.level))).toEqual(
      new Set(["A1", "A2", "B1"]),
    );
  });
  it("adds complete thousand-word long reads without replacing saved short articles", () => {
    expect(longReadDemos).toHaveLength(4);
    for (const data of longReadDemos) {
      const article = getSample(`sample-${data.key}`)!;
      expect(
        englishProseWordCount(article.sourceBlocks),
      ).toBeGreaterThanOrEqual(1000);
      expect(article.origin).toBe("demo-authored-long");
      expect(article.sourceBlocks).toHaveLength(data.learning.length);
      expect(data.learning.every((text) => Boolean(text.trim()))).toBe(true);
      expect(
        data.learning.join("").match(/\p{Script=Han}/gu)!.length,
      ).toBeGreaterThan(1000);
      expect(
        new Set(data.learning.filter((text) => !text.startsWith("```"))).size,
      ).toBe(data.learning.filter((text) => !text.startsWith("```")).length);
      for (const term of data.terms)
        expect(termSchema.safeParse(term).success).toBe(true);
    }
    expect(getSample("sample-react-state-v1")?.title).toBe(
      "状态更新，并不会立刻发生",
    );
    expect(
      getSample("sample-http-cache-v1")?.version?.paragraphs[0].sourceId,
    ).toBe("p0001");
  });
  it("does not pad the English prose count with headings, code or link URLs", () => {
    const blocks = parseSource(
      "# A heading does not count\n\nThree plain words.\n\n```js\n" +
        "fake code word ".repeat(1000) +
        "\n```\n\nRead [the guide](https://example.com/many-extra-url-words).",
    );
    expect(englishProseWordCount(blocks)).toBe(6);
  });
  it("does not resolve arbitrary private IDs or allow mutation to contaminate the shared catalog", () => {
    expect(getSample("private-article-id")).toBeNull();
    expect(getSample("sample-unknown")).toBeNull();
    const id = listSamples()[0].id;
    const changed = getSample(id)!;
    changed.title = "private";
    changed.version!.occurrences[0].word.user = {
      status: "KNOWN",
      favorite: true,
      exposureCount: 99,
      category: null,
      reviewCount: 1,
      knownStreak: 1,
      dueAt: null,
    };
    expect(getSample(id)!.title).not.toBe("private");
    expect(getSample(id)!.version!.occurrences[0].word.user).toBeNull();
  });
  it("persists sample favorites/progress locally without touching private APIs or shared articles", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const article = getSample(listSamples()[0].id)!;
    const word = article.version!.occurrences[0].word;
    expect(saveSampleWord(word.id, { favorite: true })).toMatchObject({
      favorite: true,
      status: "LEARNING",
      reviewCount: 0,
    });
    saveSampleProgress(article.id, {
      paragraphId: "p0003",
      glossMode: "click",
      view: "original",
      completed: true,
    });
    expect(sampleWithProgress(getSample(article.id)!).progress).toMatchObject({
      paragraphId: "p0003",
      glossMode: "click",
      view: "original",
      completed: true,
    });
    expect(
      sampleVocabulary().find((w) => w.id === word.id)!.user!.favorite,
    ).toBe(true);
    expect(sampleShelf()[0].progress!.completed).toBe(true);
    expect(network).not.toHaveBeenCalled();
    const known = saveSampleWord(word.id, { status: "KNOWN" });
    expect(saveSampleWord(word.id, { category: "technical" }).dueAt).toBe(
      known.dueAt,
    );
    expect(saveSampleWord(word.id, { favorite: false }).reviewCount).toBe(
      known.reviewCount,
    );
    expect(() =>
      saveSampleProgress("private-id", { completed: true }),
    ).toThrow();
    expect(() => saveSampleWord("private-word", { favorite: true })).toThrow();
    values.clear();
    expect(sampleWithProgress(getSample(article.id)!).progress).toBeNull();
    expect(sampleVocabulary().find((w) => w.id === word.id)!.user).toBeNull();
  });
});
