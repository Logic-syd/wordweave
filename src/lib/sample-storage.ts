import { z } from "zod";
import { getSample, listSamples } from "./samples";
import { termSchema } from "./schemas";
import { publishedVocabularyArticles } from "./published-catalog";
import type { ArticleDetail, UserWord, VocabularyView } from "./types";

const KEY = "wordweave.samples.v1";
const userSchema = z.object({
  status: z.enum(["NEW", "LEARNING", "KNOWN", "IGNORED"]),
  favorite: z.boolean(),
  category: z.enum(["technical", "general"]).nullable(),
  exposureCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  knownStreak: z.number().int().nonnegative(),
  dueAt: z.string().nullable(),
});
const progressSchema = z.object({
  paragraphId: z.string().nullable(),
  view: z.enum(["learning", "original"]),
  glossMode: z.enum(["all", "first", "click"]),
  completed: z.boolean(),
  retention: z.enum(["low", "medium", "high"]).optional(),
  updatedAt: z.string(),
});
const snapshotSchema = termSchema.omit({ reviewVocabularyId: true }).extend({
  language: z.literal("en"),
  appearances: z
    .array(
      z.object({
        articleId: z.string(),
        title: z.string(),
        sourceId: z.string(),
        sentence: z.string(),
        form: z.string(),
      }),
    )
    .max(1000),
});
const schema = z.object({
  words: z.record(z.string(), userSchema),
  progress: z.record(z.string(), progressSchema),
  // Keep explicitly saved daily word cards usable even before an old edition is downloaded.
  snapshots: z.record(z.string(), snapshotSchema).default({}),
  practice: z
    .record(
      z.string(),
      z.array(
        z.object({
          skill: z.enum(["listen", "speak", "read"]),
          articleId: z.string(),
          sourceId: z.string(),
          title: z.string(),
          sentence: z.string(),
          form: z.string(),
          href: z
            .string()
            .regex(/^\/(?:(listen|speak)\?|read\/local-article-)/),
        }),
      ),
    )
    .default({}),
});
type State = z.infer<typeof schema>;
function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? schema.parse(JSON.parse(raw))
      : { words: {}, progress: {}, practice: {}, snapshots: {} };
  } catch {
    return { words: {}, progress: {}, practice: {}, snapshots: {} };
  }
}
function write(state: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    throw new Error("浏览器无法保存记录，请检查是否允许本地存储。");
  }
}
export function sampleWithProgress(article: ArticleDetail): ArticleDetail {
  const state = read();
  const result =
    getSample(article.id, state.progress[article.id]?.retention ?? "medium") ??
    structuredClone(article);
  result.progress = state.progress[article.id] ?? null;
  for (const o of result.version?.occurrences ?? [])
    o.word.user = state.words[o.word.id] ?? null;
  return result;
}
export function saveSampleProgress(id: string, patch: Record<string, unknown>) {
  const article = getSample(id);
  if (!article) throw new Error("范文不存在。");
  const state = read();
  const progress = progressSchema.parse({
    ...(state.progress[id] ?? {
      paragraphId: null,
      view: "learning",
      glossMode: "first",
      completed: false,
    }),
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  if (
    progress.paragraphId &&
    !article.sourceBlocks.some((b) => b.id === progress.paragraphId)
  )
    throw new Error("阅读段落不存在。");
  state.progress[id] = progress;
  write(state);
}
export function saveSampleWord(
  id: string,
  patch: Record<string, unknown>,
): UserWord {
  const word = sampleVocabulary().find((w) => w.id === id);
  if (!word) throw new Error("词条不存在。");
  const state = read();
  const previous = state.words[id] ?? {
    status: "NEW",
    favorite: false,
    category: null,
    exposureCount: word.appearances.length,
    reviewCount: 0,
    knownStreak: 0,
    dueAt: null,
  };
  const user = userSchema.parse({ ...previous, ...patch });
  if (patch.favorite === true && user.status === "NEW")
    user.status = "LEARNING";
  if (patch.status) {
    user.reviewCount++;
    user.knownStreak = user.status === "KNOWN" ? previous.knownStreak + 1 : 0;
  }
  if (patch.status || previous.status !== user.status)
    user.dueAt =
      user.status === "LEARNING"
        ? new Date().toISOString()
        : user.status === "KNOWN"
          ? new Date(
              Date.now() +
                [1, 3, 7, 14, 30][
                  Math.min(Math.max(user.knownStreak - 1, 0), 4)
                ] *
                  86400000,
            ).toISOString()
          : null;
  state.words[id] = user;
  if (id.startsWith("sample-daily-word-")) {
    state.snapshots[id] = snapshotSchema.parse({
      ...word,
      appearances: word.appearances.filter((appearance) => !appearance.skill),
    });
  }
  write(state);
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("wordweave:vocabulary"));
  return user;
}
export function saveSamplePracticeOccurrence(
  id: string,
  appearance: State["practice"][string][number],
) {
  const state = read();
  if (!state.words[id]) throw new Error("请先保存这个范文词条。");
  const previous = state.practice[id] ?? [];
  if (
    !previous.some(
      (a) =>
        a.skill === appearance.skill &&
        a.articleId === appearance.articleId &&
        a.sourceId === appearance.sourceId,
    )
  ) {
    state.practice[id] = [...previous, appearance];
    state.words[id].exposureCount++;
    write(schema.parse(state));
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("wordweave:vocabulary"));
  }
}
export function removeSampleArticleOccurrences(articleId: string) {
  const state = read();
  if (
    !Object.values(state.practice).some((items) =>
      items.some((a) => a.articleId === articleId),
    )
  )
    return;
  for (const id of Object.keys(state.practice))
    state.practice[id] = state.practice[id].filter(
      (a) => a.articleId !== articleId,
    );
  write(state);
}
export function sampleShelf() {
  const state = read();
  return listSamples()
    .map((a) => ({ ...a, progress: state.progress[a.id] ?? null }))
    .sort((a, b) =>
      (b.progress?.updatedAt ?? "").localeCompare(a.progress?.updatedAt ?? ""),
    );
}
export function sampleVocabulary(): VocabularyView[] {
  const state = read();
  const words = new Map<string, VocabularyView>();
  for (const snapshot of Object.values(state.snapshots))
    words.set(snapshot.id, {
      ...snapshot,
      user: state.words[snapshot.id] ?? null,
    });
  for (const article of [
    ...listSamples().map((summary) => getSample(summary.id)!),
    ...publishedVocabularyArticles(),
  ]) {
    for (const o of article.version!.occurrences) {
      const word = words.get(o.word.id) ?? {
        ...o.word,
        user: state.words[o.word.id] ?? null,
        appearances: [],
      };
      if (
        !word.appearances.some(
          (a) =>
            a.articleId === article.id &&
            a.sourceId === o.sourceId &&
            a.form === o.form &&
            a.sentence === o.sentence,
        )
      )
        word.appearances.push({
          articleId: article.id,
          title: article.title,
          sourceId: o.sourceId,
          sentence: o.sentence,
          form: o.form,
        });
      words.set(word.id, word);
    }
  }
  return [...words.values()].map((w) => ({
    ...w,
    appearances: [...w.appearances, ...(state.practice[w.id] ?? [])],
  }));
}
