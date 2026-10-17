import type { ArticleDetail } from "./types";

// The shared repository returns extra ORM fields at runtime. Pick the public
// reader contract instead of spreading job tokens, owner IDs or nested users.
export function safeExtensionArticle(article: ArticleDetail): ArticleDetail {
  return {
    id: article.id,
    title: article.title,
    mode: article.mode,
    language: article.language,
    sourceUrl: article.sourceUrl,
    sourceText: article.sourceText,
    sourceBlocks: article.sourceBlocks,
    origin: article.origin,
    generationStartedAt: article.generationStartedAt,
    generationError: article.generationError,
    generationProgress: article.generationProgress,
    createdAt: article.createdAt,
    defaultGlossMode: article.defaultGlossMode,
    progress: article.progress
      ? {
          paragraphId: article.progress.paragraphId,
          view: article.progress.view,
          glossMode: article.progress.glossMode,
          completed: article.progress.completed,
        }
      : null,
    version: article.version
      ? {
          id: article.version.id,
          settings: article.version.settings,
          coverage: article.version.coverage,
          createdAt: article.version.createdAt,
          paragraphs: article.version.paragraphs.map((paragraph) => ({
            id: paragraph.id,
            sourceId: paragraph.sourceId,
            position: paragraph.position,
            original: paragraph.original,
            segments: paragraph.segments,
          })),
          occurrences: article.version.occurrences.map((occurrence) => ({
            id: occurrence.id,
            vocabularyId: occurrence.vocabularyId,
            sourceId: occurrence.sourceId,
            form: occurrence.form,
            meaning: occurrence.meaning,
            sentence: occurrence.sentence,
            targetKind: occurrence.targetKind,
            word: {
              id: occurrence.word.id,
              language: occurrence.word.language,
              lemma: occurrence.word.lemma,
              partOfSpeech: occurrence.word.partOfSpeech,
              meaning: occurrence.word.meaning,
              grammar: occurrence.word.grammar,
              explanation: occurrence.word.explanation,
              example: occurrence.word.example,
              exampleTranslation: occurrence.word.exampleTranslation,
              user: occurrence.word.user
                ? {
                    status: occurrence.word.user.status,
                    favorite: occurrence.word.user.favorite,
                    category: occurrence.word.user.category,
                    exposureCount: occurrence.word.user.exposureCount,
                    reviewCount: occurrence.word.user.reviewCount,
                    knownStreak: occurrence.word.user.knownStreak,
                    dueAt: occurrence.word.user.dueAt,
                  }
                : null,
            },
          })),
        }
      : null,
  };
}
