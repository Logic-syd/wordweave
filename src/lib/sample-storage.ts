import { z } from "zod";
import { getSample, listSamples } from "./samples";
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
  updatedAt: z.string(),
});
const schema = z.object({
  words: z.record(z.string(), userSchema),
  progress: z.record(z.string(), progressSchema),
});
type State = z.infer<typeof schema>;
function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? schema.parse(JSON.parse(raw)) : { words: {}, progress: {} };
  } catch {
    return { words: {}, progress: {} };
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
  const result = structuredClone(article);
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
  write(state);
  return user;
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
  for (const summary of listSamples()) {
    const article = getSample(summary.id)!;
    for (const o of article.version!.occurrences) {
      const word = words.get(o.word.id) ?? {
        ...o.word,
        user: state.words[o.word.id] ?? null,
        appearances: [],
      };
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
  return [...words.values()];
}
