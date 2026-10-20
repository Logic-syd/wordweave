import { originalDemos, demoSegments } from "./demo-content";
import { extraDemos } from "./sample-extras";
import { parseSource } from "./markdown";
import { settingsSchema } from "./schemas";
import type { ArticleDetail, LibraryArticle, OccurrenceView } from "./types";

// Public reading is a fixed, reviewed catalog, never a query over users' articles.
const date = "2026-10-20T00:00:00.000Z";
const samples: ArticleDetail[] = [...originalDemos, ...extraDemos].map(
  (data) => {
    const id = `sample-${data.key}`;
    const blocks = parseSource(data.source);
    const occurrences: OccurrenceView[] = [];
    const paragraphs = blocks.map((block, position) => ({
      id: `${id}-${block.id}`,
      sourceId: block.id,
      position,
      original: block.original,
      segments: demoSegments(
        data.learning[position] || block.original,
        data.terms,
        block.original,
      ).map((segment, i) => {
        if (segment.type === "text") return segment;
        const term = data.terms.find((t) => t.id === segment.termId)!;
        const occurrenceId = `${id}-${block.id}-${i}`;
        const vocabularyId = `${id}-word-${term.id}`;
        occurrences.push({
          id: occurrenceId,
          vocabularyId,
          sourceId: block.id,
          form: segment.text,
          meaning: segment.meaning,
          sentence: segment.sentence,
          targetKind: "new",
          word: {
            ...term,
            id: vocabularyId,
            language: data.language,
            user: null,
          },
        });
        return { ...segment, occurrenceId };
      }),
    }));
    const newWords = [...new Set(occurrences.map((o) => o.word.lemma))];
    return {
      id,
      title: data.title,
      mode: data.mode,
      language: data.language,
      origin: data.origin,
      sourceUrl: null,
      sourceText: data.source,
      sourceBlocks: blocks,
      createdAt: date,
      generationStartedAt: null,
      generationError: null,
      generationProgress: null,
      progress: null,
      defaultGlossMode: "first",
      version: {
        id: `${id}-v1`,
        createdAt: date,
        paragraphs,
        occurrences,
        settings: settingsSchema.parse({
          level: "level" in data ? data.level : "A2",
          newWordCount: newWords.length === 3 ? 3 : 5,
        }),
        coverage: {
          newWords,
          reviewWords: [],
          requestedNew: newWords.length,
          requestedReview: 0,
          missing: [],
        },
      },
    };
  },
);

export function getSample(id: string): ArticleDetail | null {
  const article = samples.find((item) => item.id === id);
  return article ? structuredClone(article) : null;
}
export function listSamples(mode?: string): LibraryArticle[] {
  return samples
    .filter((a) => !mode || a.mode === mode)
    .map((a) => ({
      id: a.id,
      title: a.title,
      mode: a.mode,
      origin: a.origin,
      createdAt: date,
      updatedAt: date,
      activeVersionId: a.version!.id,
      generationStartedAt: null,
      generationError: null,
      progress: null,
      level: a.version!.settings.level,
      preview: a
        .version!.paragraphs.slice(1, 3)
        .flatMap((p) => p.segments.map((s) => s.text))
        .join("")
        .slice(0, 110),
    }));
}
