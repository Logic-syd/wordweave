import seed from "../content/daily-seed.json";
import {
  validateDailyEdition,
  publicationLevels,
  retentionSettings,
  type DailyEdition,
} from "./daily-publication";
import { parseSource } from "./markdown";
import { normalizeLemma } from "./review";
import type { Settings } from "./schemas";
import type { ArticleDetail, OccurrenceView } from "./types";

const editions = new Map<string, DailyEdition>();
const versions = new Map<string, ArticleDetail>();
function senseId(lemma: string, partOfSpeech: string, meaning: string) {
  let hash = 14695981039346656037n;
  for (const char of `${normalizeLemma(lemma, "en")}\0${partOfSpeech}\0${meaning.normalize("NFKC").trim()}`)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n,
    );
  return `sample-daily-word-${hash.toString(16)}`;
}
export function registerDailyEdition(value: unknown) {
  const edition = validateDailyEdition(value);
  if (editions.has(edition.date)) {
    if (JSON.stringify(editions.get(edition.date)) !== JSON.stringify(edition))
      throw new Error("A published daily edition cannot be silently replaced.");
    return edition;
  }
  editions.set(edition.date, edition);
  for (const article of edition.articles)
    for (const retention of publicationLevels) {
      const generation = article.versions[retention].content;
      const occurrences: OccurrenceView[] = [];
      const paragraphs = generation.paragraphs.map((p, position) => ({
        id: `${article.id}-${p.id}`,
        sourceId: p.id,
        position,
        original: p.original!,
        segments: p.segments.map((segment, index) => {
          if (segment.type === "text") return segment;
          const term = generation.terms.find((t) => t.id === segment.termId)!;
          const vocabularyId = senseId(
            term.lemma,
            term.partOfSpeech,
            term.meaning,
          );
          const id = `${article.id}-${retention}-${p.id}-${index}`;
          occurrences.push({
            id,
            vocabularyId,
            sourceId: p.id,
            form: segment.text,
            meaning: segment.meaning,
            sentence: segment.sentence,
            targetKind: "new",
            word: { ...term, id: vocabularyId, language: "en", user: null },
          });
          return { ...segment, occurrenceId: id };
        }),
      }));
      const newWords = [...new Set(occurrences.map((o) => o.word.lemma))];
      versions.set(`${article.id}:${retention}`, {
        id: article.id,
        title: article.title,
        mode: "tech",
        language: "en",
        origin: "daily-deepseek",
        sourceUrl: null,
        sourceText: article.sourceText,
        sourceBlocks: parseSource(article.sourceText),
        createdAt: edition.publishedAt,
        generationStartedAt: null,
        generationError: null,
        generationProgress: null,
        defaultGlossMode: "first",
        progress: null,
        publication: {
          date: edition.date,
          provider: "DeepSeek",
          model: article.versions[retention].processing.model,
          processedAt: article.versions[retention].processing.completedAt,
        },
        version: {
          id: `${article.id}-${retention}`,
          settings: retentionSettings(retention),
          createdAt: article.versions[retention].processing.completedAt,
          paragraphs,
          occurrences,
          coverage: {
            newWords,
            reviewWords: [],
            requestedNew: newWords.length,
            requestedReview: 0,
            missing: [],
          },
        },
      });
    }
  return edition;
}
for (const edition of seed) registerDailyEdition(edition);

export function latestDailyEdition(day: string) {
  return (
    [...editions.values()]
      .filter((edition) => edition.date <= day)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}
export function firstPublicationDate() {
  return [...editions.keys()].sort()[0] ?? null;
}
export function getPublishedSample(
  id: string,
  retention: Settings["retention"] = "medium",
) {
  const value = versions.get(`${id}:${retention}`);
  return value ? structuredClone(value) : null;
}
export function publishedVocabularyArticles() {
  return [...versions.values()];
}
