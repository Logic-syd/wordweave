import { afterEach, describe, expect, it, vi } from "vitest";
import { getSample, listSamples } from "../src/lib/samples";
import { sourceContainsSentence } from "../src/lib/markdown";
import {
  sampleVocabulary,
  sampleWithProgress,
  saveSampleProgress,
  saveSampleWord,
} from "../src/lib/sample-storage";
import type { ArticleDetail } from "../src/lib/types";

afterEach(() => vi.unstubAllGlobals());

function englishWords(article: ArticleDetail) {
  return (
    article
      .version!.paragraphs.filter((p) =>
        ["paragraph", "list", "blockquote"].includes(
          article.sourceBlocks.find((b) => b.id === p.sourceId)!.kind,
        ),
      )
      .flatMap((p) => p.segments)
      .map((s) => s.text)
      .join(" ")
      .match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0
  );
}

describe("bundled English reading levels", () => {
  it("all English samples have genuinely increasing English content, stable correspondence and intact protected text", () => {
    for (const summary of listSamples("tech")) {
      const medium = getSample(summary.id)!;
      const low = getSample(summary.id, "low")!;
      const high = getSample(summary.id, "high")!;
      expect(englishWords(low), summary.id).toBeLessThan(englishWords(medium));
      expect(englishWords(high), summary.id).toBeGreaterThan(
        englishWords(medium),
      );
      for (const [level, article] of [
        ["low", low],
        ["medium", medium],
        ["high", high],
      ] as const) {
        expect(article.version!.settings.retention).toBe(level);
        expect(article.sourceText).toBe(medium.sourceText);
        expect(article.sourceBlocks).toEqual(medium.sourceBlocks);
        expect(article.version!.paragraphs.map((p) => p.sourceId)).toEqual(
          medium.version!.paragraphs.map((p) => p.sourceId),
        );
        for (const paragraph of article.version!.paragraphs) {
          const block = article.sourceBlocks.find(
            (b) => b.id === paragraph.sourceId,
          )!;
          const text = paragraph.segments.map((s) => s.text).join("");
          expect(text).not.toContain("[[");
          expect(text.trim()).not.toBe("");
          expect(paragraph.original).toBe(block.original);
          if (block.kind === "code") expect(text).toBe(block.original);
          for (const protectedText of Object.values(block.protected))
            expect(text).toContain(protectedText);
        }
        for (const occurrence of article.version!.occurrences) {
          const original = article.sourceBlocks.find(
            (p) => p.id === occurrence.sourceId,
          )!.original;
          expect(sourceContainsSentence(original, occurrence.sentence)).toBe(
            true,
          );
          expect(
            sourceContainsSentence(occurrence.sentence, occurrence.form),
          ).toBe(true);
          expect(
            medium.version!.occurrences.some(
              (o) => o.vocabularyId === occurrence.vocabularyId,
            ),
          ).toBe(true);
        }
        expect(article.version!.coverage.newWords.length).toBe(
          new Set(article.version!.occurrences.map((o) => o.word.lemma)).size,
        );
      }
      // Switching levels cannot mutate the shared default catalog.
      expect(getSample(summary.id)).toEqual(medium);
    }
  });

  it("keeps critical negation and complete original clauses across levels", () => {
    for (const level of ["low", "medium", "high"] as const) {
      const article = getSample("sample-async-search-long-v1", level)!;
      const text = article
        .version!.paragraphs.flatMap((p) => p.segments)
        .map((s) => s.text)
        .join("");
      expect(text).toMatch(/取消并不是|cancellation is not a/);
      expect(text).toContain("不保证服务器撤销了全部操作");
      expect(text).toContain("不能证明操作根本没有发生");
      if (level === "high")
        expect(text).toContain(
          "For that reason, cancellation is not a rollback mechanism.",
        );
    }
  });

  it("restores each sample's level without dropping favorites, gloss settings or progress", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const article = getSample("sample-react-state-long-v1")!;
    const snapshot = article.version!.occurrences.find(
      (o) => o.word.lemma === "snapshot of the state",
    )!.word;
    saveSampleWord(snapshot.id, { favorite: true });
    saveSampleProgress(article.id, {
      paragraphId: "p0009",
      view: "learning",
      glossMode: "click",
      retention: "low",
    });
    const low = sampleWithProgress(article);
    expect(low.version!.settings.retention).toBe("low");
    expect(low.progress).toMatchObject({
      paragraphId: "p0009",
      glossMode: "click",
      retention: "low",
    });
    expect(
      low.version!.occurrences.some((o) => o.word.id === snapshot.id),
    ).toBe(false);
    expect(
      sampleVocabulary().find((w) => w.id === snapshot.id)!.user!.favorite,
    ).toBe(true);
    saveSampleProgress(article.id, { retention: "high" });
    const high = sampleWithProgress(article);
    expect(high.version!.settings.retention).toBe("high");
    expect(
      high.version!.occurrences.find((o) => o.word.id === snapshot.id)!.word
        .user!.favorite,
    ).toBe(true);
    expect(high.progress!.paragraphId).toBe("p0009");
    expect(
      sampleWithProgress(getSample("sample-async-search-long-v1")!).version!
        .settings.retention,
    ).toBe("medium");
    expect(() =>
      saveSampleProgress(article.id, { retention: "invalid" }),
    ).toThrow();
    expect(sampleWithProgress(article).version!.settings.retention).toBe(
      "high",
    );
  });
});
