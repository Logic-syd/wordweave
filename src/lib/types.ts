import type { Settings, Segment, Term } from "./schemas";
import type { SourceBlock } from "./markdown";
export type UserWord = {
  status: string;
  favorite: boolean;
  category: string | null;
  exposureCount: number;
  reviewCount: number;
  knownStreak: number;
  dueAt: string | null;
};
export type Word = {
  id: string;
  language: string;
  lemma: string;
  partOfSpeech: string;
  meaning: string;
  grammar: Term["grammar"];
  explanation: string;
  example: string;
  exampleTranslation: string;
  user: UserWord | null;
};
export type OccurrenceView = {
  id: string;
  vocabularyId: string;
  sourceId: string;
  form: string;
  meaning: string;
  sentence: string;
  targetKind: string;
  word: Word;
};
export type Coverage = {
  newWords: string[];
  reviewWords: string[];
  requestedNew: number;
  requestedReview: number;
  missing: string[];
};
export type ArticleDetail = {
  id: string;
  title: string;
  mode: string;
  language: string;
  sourceUrl: string | null;
  sourceText: string;
  sourceBlocks: SourceBlock[];
  origin: string;
  generationStartedAt: string | null;
  generationError: string | null;
  createdAt: string;
  version: null | {
    id: string;
    settings: Settings;
    coverage: Coverage;
    createdAt: string;
    paragraphs: {
      id: string;
      sourceId: string;
      position: number;
      original: string;
      segments: Segment[];
    }[];
    occurrences: OccurrenceView[];
  };
  progress: {
    paragraphId: string | null;
    view: string;
    glossMode: string;
    completed: boolean;
  } | null;
  defaultGlossMode: string;
};
export type LibraryArticle = {
  level?: string;
  id: string;
  title: string;
  mode: string;
  origin: string;
  createdAt: string;
  updatedAt: string;
  activeVersionId: string | null;
  generationStartedAt: string | null;
  generationError: string | null;
  progress: {
    paragraphId: string | null;
    completed: boolean;
    updatedAt: string;
  } | null;
  preview: string;
};
export type VocabularyView = Word & {
  appearances: {
    articleId: string;
    title: string;
    sentence: string;
    form: string;
    sourceId: string;
  }[];
};
