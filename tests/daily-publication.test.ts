import { describe, expect, it } from "vitest";
import seed from "../src/content/daily-seed.json";
import {
  dailyEditionSchema,
  dayFromDailyId,
  learningEnglishWords,
  publicationDate,
  publicationDay,
  publicationLevels,
  validateDailyArticle,
  validateDailyEdition,
} from "../src/lib/daily-publication";
import { englishProseWordCount, parseSource } from "../src/lib/markdown";
import {
  getPublishedSample,
  registerDailyEdition,
} from "../src/lib/published-catalog";

const edition = () => dailyEditionSchema.parse(structuredClone(seed[0]));
describe("real daily editorial artifacts", () => {
  it("ships two complete long reads with processed levels and passing review receipts", () => {
    expect(seed).toHaveLength(1);
    const issue = validateDailyEdition(edition());
    for (const article of issue.articles) {
      expect(
        englishProseWordCount(parseSource(article.sourceText)),
      ).toBeGreaterThanOrEqual(1000);
      const counts = publicationLevels.map((level) =>
        learningEnglishWords(
          article.versions[level].content,
          article.sourceText,
        ),
      );
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
      expect(article.review.processing.completionIds.length).toBeGreaterThan(0);
      expect(getPublishedSample(article.id, "high")?.publication?.date).toBe(
        issue.date,
      );
    }
  });
  it("blocks missing receipts, failed reviews, changed code and misaligned word cards", () => {
    const article = edition().articles[0];
    const missing = structuredClone(article);
    missing.versions.medium.processing.completionIds = [];
    expect(() => validateDailyArticle(missing)).toThrow();
    const rejected = structuredClone(article);
    rejected.review.result.approved = false;
    expect(() => validateDailyArticle(rejected)).toThrow(/review/);
    const misaligned = structuredClone(article);
    const term = misaligned.versions.medium.content.paragraphs
      .flatMap((p) => p.segments)
      .find((s) => s.type === "term")!;
    if (term.type === "term")
      term.sentence = "This invented sentence never appeared in the article.";
    expect(() => validateDailyArticle(misaligned)).toThrow(/original sentence/);
    const literal = structuredClone(article);
    literal.sourceText += '\n\n```js\nconst preserved = "exact";\n```';
    const block = parseSource(literal.sourceText).at(-1)!;
    for (const level of publicationLevels)
      literal.versions[level].content.paragraphs.push({
        id: block.id,
        original: block.original,
        segments: [{ type: "text", text: block.original }],
      });
    expect(() => validateDailyArticle(literal)).not.toThrow();
    literal.versions.low.content.paragraphs.at(-1)!.segments[0].text =
      "changed code";
    expect(() => validateDailyArticle(literal)).toThrow(/literal content/);
  });
  it("rejects identical levels, changed published editions and invalid calendar dates", () => {
    const article = edition().articles[0];
    article.versions.low.content = structuredClone(
      article.versions.medium.content,
    );
    expect(() => validateDailyArticle(article)).toThrow(/retention/);
    const changed = edition();
    changed.articles[0].title += " changed";
    expect(() => registerDailyEdition(changed)).toThrow(/silently replaced/);
    expect(publicationDate.safeParse("2026-02-30").success).toBe(false);
    expect(publicationDay(new Date("2026-11-24T23:30:00Z"))).toBe("2026-11-25");
    expect(dayFromDailyId("sample-daily-2026-11-25-2")).toBe("2026-11-25");
    expect(dayFromDailyId("../../outside")).toBeNull();
  });
});
