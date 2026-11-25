import { z } from "zod";
import { generationSchema, type Generation, type Settings } from "./schemas";
import {
  assertNoGeneratedMarkup,
  englishProseWordCount,
  parseSource,
  sourceContainsSentence,
} from "./markdown";

export const publicationDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const n = Date.parse(`${value}T00:00:00Z`);
    return (
      Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value
    );
  });
export const publicationLevels = ["low", "medium", "high"] as const;
export const dailySampleId = z
  .string()
  .regex(/^sample-daily-\d{4}-\d{2}-\d{2}-[12]$/);
const receiptSchema = z.object({
  provider: z.literal("deepseek"),
  model: z.string().min(1).max(120),
  completedAt: z.iso.datetime(),
  completionIds: z.array(z.string().min(1).max(200)).min(1).max(50),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export const editorialReviewSchema = z.object({
  approved: z.boolean(),
  fidelity: z.number().min(0).max(5),
  naturalness: z.number().min(0).max(5),
  learningValue: z.number().min(0).max(5),
  issues: z.array(z.string().max(800)).max(12),
});
const processedVersion = z.object({
  content: generationSchema,
  processing: receiptSchema,
});
export const dailyArticleSchema = z.object({
  id: dailySampleId,
  title: z.string().min(1).max(120),
  topic: z.string().min(1).max(160),
  sourceText: z.string().min(1000).max(22000),
  references: z
    .array(z.url().refine((url) => url.startsWith("https://")))
    .min(1)
    .max(4),
  sourceProcessing: receiptSchema,
  versions: z.object({
    low: processedVersion,
    medium: processedVersion,
    high: processedVersion,
  }),
  review: z.object({
    result: editorialReviewSchema,
    processing: receiptSchema,
  }),
});
export const dailyEditionSchema = z.object({
  schemaVersion: z.literal(1),
  date: publicationDate,
  publishedAt: z.iso.datetime(),
  articles: z.tuple([dailyArticleSchema, dailyArticleSchema]),
});
export type DailyEdition = z.infer<typeof dailyEditionSchema>;
export type DailyArticle = DailyEdition["articles"][number];
export const dailyIndexSchema = z.object({
  schemaVersion: z.literal(1),
  editions: z
    .array(
      z.object({
        date: publicationDate,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(4000),
});
export type DailyIndex = z.infer<typeof dailyIndexSchema>;
export const DAILY_FEED =
  "https://raw.githubusercontent.com/Logic-syd/wordweave/daily-content";
export const MAX_EDITION_BYTES = 3 * 1024 * 1024;

export function learningEnglishWords(content: Generation, sourceText: string) {
  const blocks = parseSource(sourceText);
  return (
    content.paragraphs
      .filter((p) =>
        ["paragraph", "list", "blockquote"].includes(
          blocks.find((b) => b.id === p.id)?.kind ?? "",
        ),
      )
      .flatMap((p) => p.segments)
      .map((s) => s.text)
      .join(" ")
      .match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0
  );
}

/** Validate the restored, public artifact again, both before publishing and after fetching. */
export function validateDailyArticle(value: unknown): DailyArticle {
  const article = dailyArticleSchema.parse(value);
  const blocks = parseSource(article.sourceText);
  const words = englishProseWordCount(blocks);
  if (words < 1000 || words > 1800)
    throw new Error(
      "Daily originals must contain 1,000–1,800 English prose words.",
    );
  if (blocks.length < 8 || blocks.length > 60)
    throw new Error("Daily article structure is incomplete.");
  const counts: number[] = [];
  for (const level of publicationLevels) {
    const { content } = article.versions[level];
    if (content.paragraphs.length !== blocks.length)
      throw new Error("Daily paragraph correspondence is incomplete.");
    const terms = new Map(content.terms.map((t) => [t.id, t]));
    if (terms.size !== content.terms.length)
      throw new Error("Daily expression IDs must be unique.");
    const used = new Set<string>();
    content.paragraphs.forEach((p, index) => {
      const block = blocks[index];
      if (
        p.id !== block.id ||
        p.original !== block.original ||
        p.translationStatus === "refused"
      )
        throw new Error("Daily translation is incomplete or misaligned.");
      const text = p.segments.map((s) => s.text).join("");
      if (!text.trim()) throw new Error("A daily paragraph cannot be empty.");
      if (
        ["code", "html", "definition", "thematicBreak"].includes(block.kind)
      ) {
        if (text !== block.original)
          throw new Error("Daily literal content was changed.");
      } else {
        let unprotected = text;
        for (const literal of new Set(Object.values(block.protected))) {
          if (
            text.split(literal).length !== block.original.split(literal).length
          )
            throw new Error(
              "Daily protected code or links were lost or duplicated.",
            );
          unprotected = unprotected.replaceAll(literal, "");
        }
        assertNoGeneratedMarkup(unprotected);
        const renderedBlocks = parseSource(text);
        if (
          renderedBlocks.length !== 1 ||
          renderedBlocks[0].kind !== block.kind
        )
          throw new Error("Daily Markdown block structure changed.");
        if (
          block.kind !== "heading" &&
          /[a-z]{15}/i.test(block.original.replace(/\s/g, "")) &&
          !/\p{Script=Han}/u.test(
            p.segments
              .filter((s) => s.type === "text")
              .map((s) => s.text)
              .join(""),
          )
        )
          throw new Error(
            "Daily learning paragraphs need a real Chinese translation.",
          );
      }
      for (const s of p.segments)
        if (s.type === "term") {
          if (
            !terms.has(s.termId) ||
            !sourceContainsSentence(block.original, s.sentence) ||
            !sourceContainsSentence(
              s.sentence.toLowerCase(),
              s.text.toLowerCase(),
            )
          )
            throw new Error(
              "Daily word cards do not match their original sentence.",
            );
          used.add(s.termId);
        }
    });
    if (used.size < 6 || used.size !== terms.size)
      throw new Error(
        "Daily expressions must appear in the article; at least six are required.",
      );
    counts.push(learningEnglishWords(content, article.sourceText));
  }
  if (!(counts[0] * 1.3 <= counts[1] && counts[1] * 1.3 <= counts[2]))
    throw new Error(
      "English retention must increase meaningfully across the three versions.",
    );
  const review = article.review.result;
  if (
    !review.approved ||
    Math.min(review.fidelity, review.naturalness, review.learningValue) < 4 ||
    review.issues.length
  )
    throw new Error("The independent model editorial review did not pass.");
  return article;
}

export function validateDailyEdition(value: unknown): DailyEdition {
  const edition = dailyEditionSchema.parse(value);
  edition.articles.forEach((article, index) => {
    if (article.id !== `sample-daily-${edition.date}-${index + 1}`)
      throw new Error("Daily article ID does not match its edition.");
    validateDailyArticle(article);
  });
  if (edition.articles[0].sourceText === edition.articles[1].sourceText)
    throw new Error("The two daily articles must be different.");
  return edition;
}

export function publicationDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
export function dayFromDailyId(id: string) {
  return dailySampleId.safeParse(id).success ? id.slice(13, 23) : null;
}
export function retentionSettings(retention: Settings["retention"]): Settings {
  return {
    retention,
    level: "A2",
    minutes: "5-8",
    newWordCount: 8,
    topic: "技术英语",
    requestedWords: "",
    reviewOnly: false,
  };
}
