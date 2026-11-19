import {
  importSchema,
  progressSchema,
  vocabularyUpdateSchema,
  type Settings,
  type Generation,
} from "./schemas";
import { parseSource } from "./markdown";
import { normalizeLemma, reviewUpdate, selectReviewWords } from "./review";
import type {
  ArticleDetail,
  Coverage,
  LibraryArticle,
  VocabularyView,
  Word,
  UserWord,
} from "./types";
import type { PracticeState } from "./practice-store";
import {
  studyWriteSchema,
  type PracticeMaterial,
  type StudyWrite,
  type PracticeWordInput,
} from "./practice-schemas";
import { materialFromWord, practiceSamples } from "./practice-content";
import {
  sampleVocabulary,
  saveSampleWord,
  saveSamplePracticeOccurrence,
  removeSampleArticleOccurrences,
} from "./sample-storage";
import { AppError } from "./app-error";

export type LocalArticle = ArticleDetail & {
  draftSettings: Settings;
  updatedAt: string;
  requestKey: string;
};
export type BrowserData = {
  articles: Record<string, LocalArticle>;
  words: Record<string, VocabularyView>;
  practice: PracticeState;
  preferences: Record<string, { settings?: Settings; glossMode?: string }>;
};
const fresh = (): BrowserData => ({
  articles: {},
  words: {},
  practice: { materials: [], history: [], progress: {} },
  preferences: {},
});
let connection: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new AppError("浏览器未开放本地数据库，请允许本站存储数据。"));
        return;
      }
      const request = indexedDB.open("wordweave-browser", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("data");
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        connection = undefined;
        reject(new AppError("无法打开本地数据库，请检查浏览器的存储设置。"));
      };
    });
  return connection;
}
/** A single readwrite transaction prevents competing tabs from dropping writes. */
export async function browserData<T>(
  write: boolean,
  action: (data: BrowserData) => T,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("data", write ? "readwrite" : "readonly");
    const store = tx.objectStore("data");
    let result: T;
    let failure: unknown;
    const request = store.get("learning");
    request.onsuccess = () => {
      try {
        const data: BrowserData = request.result ?? fresh();
        result = action(data);
        if (write) store.put(data, "learning");
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      resolve(result);
      if (write) window.dispatchEvent(new Event("wordweave:local-data"));
    };
    tx.onabort = tx.onerror = () =>
      reject(
        failure ??
          new AppError(
            "本地保存失败，可能是浏览器存储空间不足。请导出记录后整理文章。",
          ),
      );
  });
}
const wordKey = (
  w: Pick<Word, "language" | "lemma" | "partOfSpeech" | "meaning">,
) =>
  JSON.stringify([
    w.language,
    normalizeLemma(w.lemma, w.language),
    w.partOfSpeech,
    w.meaning.normalize("NFKC").trim(),
  ]);
const initialUser = (): UserWord => ({
  status: "NEW",
  favorite: false,
  category: null,
  exposureCount: 0,
  reviewCount: 0,
  knownStreak: 0,
  dueAt: null,
});
const progressKey = (id: string) => `wordweave.reading:${id}`;
function progressJournal(id: string) {
  try {
    return progressSchema.parse(
      JSON.parse(localStorage.getItem(progressKey(id)) ?? "{}"),
    );
  } catch {
    return {};
  }
}
export async function localWords() {
  return browserData(false, (data) => Object.values(data.words));
}
export async function localReviewWords(language = "de") {
  const words = [
    ...(await localWords()),
    ...sampleVocabulary().filter((w) => w.user),
  ];
  return selectReviewWords(
    words
      .filter((w) => w.language === language)
      .map((w) => ({
        ...w,
        vocabularyId: w.id,
        status: w.user?.status ?? "NEW",
        dueAt: w.user?.dueAt ? new Date(w.user.dueAt) : null,
        favorite: w.user?.favorite ?? false,
        knownStreak: w.user?.knownStreak ?? 0,
      })),
  ).map((w) => ({
    id: w.id,
    lemma: w.lemma,
    meaning: w.meaning,
    partOfSpeech: w.partOfSpeech,
    grammar: w.grammar,
  }));
}
export async function updateLocalWord(id: string, patch: unknown) {
  const checked = vocabularyUpdateSchema.parse(patch);
  if (id.startsWith("sample-")) return saveSampleWord(id, checked);
  const result = await browserData(true, (data) => {
    const word = data.words[id];
    if (!word) throw new AppError("这个词不在当前浏览器的单词库中。", 404);
    const previous = word.user ?? initialUser();
    const user = { ...previous, ...checked };
    const status =
      checked.status ??
      (checked.favorite === true && previous.status === "NEW"
        ? "LEARNING"
        : undefined);
    if (status) {
      const review = reviewUpdate(status, previous.knownStreak);
      user.status = status;
      user.knownStreak = review.knownStreak;
      user.dueAt = review.dueAt?.toISOString() ?? null;
      if (checked.status) user.reviewCount++;
    }
    word.user = user;
    return user;
  });
  window.dispatchEvent(new Event("wordweave:vocabulary"));
  return result;
}
export async function createLocalArticle(value: unknown, key: string) {
  const input = importSchema.parse(value);
  return browserData(true, (data) => {
    const previous = Object.values(data.articles).find(
      (a) => a.requestKey === key,
    );
    if (previous) return previous;
    if (Object.keys(data.articles).length >= 200)
      throw new AppError("当前浏览器最多保存 200 篇文章，请先整理书架。");
    const id = `local-article-${crypto.randomUUID()}`,
      now = new Date().toISOString(),
      language = input.mode === "tech" ? "en" : "de";
    const article: LocalArticle = {
      id,
      title: input.title,
      mode: input.mode,
      language,
      sourceUrl: input.sourceUrl || null,
      sourceText: input.text,
      sourceBlocks: parseSource(input.text),
      origin: input.text ? "imported" : "generated",
      createdAt: now,
      updatedAt: now,
      draftSettings: input.settings,
      requestKey: key,
      generationStartedAt: null,
      generationError: null,
      generationProgress: null,
      version: null,
      progress: null,
      defaultGlossMode: data.preferences[language]?.glossMode ?? "first",
    };
    data.articles[id] = article;
    data.preferences[language] = {
      ...data.preferences[language],
      settings: input.settings,
    };
    return article;
  });
}
function requireLocal(data: BrowserData, id: string) {
  const article = data.articles[id];
  if (!article)
    throw new AppError(
      "这个浏览器里没有这篇文章。文章不会自动跨设备同步。",
      404,
    );
  return article;
}
export async function localArticle(id: string) {
  return browserData(false, (data) => {
    const article = requireLocal(data, id),
      journal = progressJournal(id);
    if (
      journal.paragraphId &&
      !article.sourceBlocks.some((p) => p.id === journal.paragraphId)
    )
      delete journal.paragraphId;
    if (Object.keys(journal).length)
      article.progress = {
        paragraphId: null,
        view: "learning",
        glossMode: article.defaultGlossMode,
        completed: false,
        ...article.progress,
        ...journal,
      };
    for (const o of article.version?.occurrences ?? [])
      o.word.user =
        data.words[o.vocabularyId]?.user ??
        (o.vocabularyId.startsWith("sample-")
          ? sampleVocabulary().find((w) => w.id === o.vocabularyId)?.user
          : null) ??
        null;
    return article;
  });
}
export async function localShelf(): Promise<LibraryArticle[]> {
  return browserData(false, (data) =>
    Object.values(data.articles)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((a) => ({
        ...a,
        activeVersionId: a.version?.id ?? null,
        progress: a.progress ? { ...a.progress, updatedAt: a.updatedAt } : null,
        level: a.draftSettings.level,
        preview: (
          a.version?.paragraphs
            .map((p) => p.segments.map((s) => s.text).join(""))
            .join(" ") || a.sourceText
        )
          .replace(/[#*`>]/g, "")
          .slice(0, 110),
      })),
  );
}
export async function saveLocalProgress(id: string, value: unknown) {
  const patch = { ...progressJournal(id), ...progressSchema.parse(value) };
  // Synchronous small journal survives an immediate refresh before IndexedDB commits.
  try {
    localStorage.setItem(progressKey(id), JSON.stringify(patch));
  } catch {
    /* IndexedDB below remains the durable store when localStorage is unavailable. */
  }
  return browserData(true, (data) => {
    const a = requireLocal(data, id);
    if (
      patch.paragraphId &&
      !a.sourceBlocks.some((p) => p.id === patch.paragraphId)
    )
      throw new AppError("阅读段落不存在。");
    a.progress = {
      paragraphId: null,
      view: "learning",
      glossMode: a.defaultGlossMode,
      completed: false,
      ...a.progress,
      ...patch,
    };
    a.updatedAt = new Date().toISOString();
    data.preferences[a.language] = {
      ...data.preferences[a.language],
      glossMode: a.progress.glossMode,
    };
    return a.progress;
  });
}
export async function deleteLocalArticle(id: string) {
  await browserData(true, (data) => {
    requireLocal(data, id);
    delete data.articles[id];
    for (const w of Object.values(data.words))
      w.appearances = w.appearances.filter((a) => a.articleId !== id);
  });
  localStorage.removeItem(progressKey(id));
  removeSampleArticleOccurrences(id);
}
export async function saveLocalVersion(
  id: string,
  result: Generation,
  settings: Settings,
  coverage: Coverage,
) {
  const saved = await browserData(true, (data) => {
    const a = requireLocal(data, id),
      versionId = crypto.randomUUID(),
      now = new Date().toISOString();
    const words = new Map<string, Word>();
    const sourceTerms = new Set(
      result.paragraphs.flatMap((p) =>
        p.segments.flatMap((s) => (s.type === "term" ? [s.termId] : [])),
      ),
    );
    const savedSamples = sampleVocabulary();
    for (const term of result.terms.filter((t) => sourceTerms.has(t.id))) {
      const candidate = { ...term, language: a.language };
      let word: VocabularyView | undefined = term.reviewVocabularyId
        ? (data.words[term.reviewVocabularyId] ??
          savedSamples.find((w) => w.id === term.reviewVocabularyId))
        : Object.values(data.words).find(
            (w) => wordKey(w) === wordKey(candidate),
          );
      if (!word) {
        const wid = `local-word-${crypto.randomUUID()}`;
        word = {
          ...term,
          id: wid,
          language: a.language,
          user: initialUser(),
          appearances: [],
        };
        data.words[wid] = word;
      }
      words.set(term.id, word);
    }
    const occurrences: NonNullable<ArticleDetail["version"]>["occurrences"] =
        [],
      exposed = new Set<string>();
    for (const w of Object.values(data.words))
      w.appearances = w.appearances.filter((o) => o.articleId !== id);
    const paragraphs = result.paragraphs.map((p, position) => ({
      id: `${versionId}:${p.id}`,
      sourceId: p.id,
      position,
      original: p.original ?? "",
      segments: p.segments.map((s) => {
        if (s.type === "text") return s;
        const word = words.get(s.termId);
        if (!word) throw new AppError("生成词条对应关系错误，未保存。", 502);
        const occurrenceId = crypto.randomUUID();
        occurrences.push({
          id: occurrenceId,
          vocabularyId: word.id,
          sourceId: p.id,
          form: s.text,
          meaning: s.meaning,
          sentence: s.sentence,
          targetKind: result.terms.find((t) => t.id === s.termId)
            ?.reviewVocabularyId
            ? "review"
            : "new",
          word: {
            ...word,
            grammar: {
              ...word.grammar,
              ...(s.currentForm ? { currentForm: s.currentForm } : {}),
              ...(s.grammarNote ? { note: s.grammarNote } : {}),
            },
          },
        });
        const stored = data.words[word.id];
        if (stored) {
          stored.appearances.push({
            skill: "read",
            articleId: id,
            sourceId: p.id,
            title: a.title,
            sentence: s.sentence,
            form: s.text,
          });
          if (!exposed.has(word.id)) {
            stored.user ??= initialUser();
            stored.user.exposureCount++;
            exposed.add(word.id);
          }
        }
        return { ...s, occurrenceId };
      }),
    }));
    if (!a.sourceText) {
      a.sourceText = result.paragraphs.map((p) => p.original).join("\n\n");
      a.sourceBlocks = parseSource(a.sourceText);
      a.title = result.title;
    }
    a.version = {
      id: versionId,
      settings,
      coverage,
      createdAt: now,
      paragraphs,
      occurrences,
    };
    a.draftSettings = settings;
    a.updatedAt = now;
    a.generationStartedAt = null;
    a.generationError = null;
    a.generationProgress = null;
    data.preferences[a.language] = {
      ...data.preferences[a.language],
      settings,
    };
    return a;
  });
  removeSampleArticleOccurrences(id);
  for (const o of saved.version!.occurrences.filter((o) =>
    o.vocabularyId.startsWith("sample-"),
  )) {
    saveSamplePracticeOccurrence(o.vocabularyId, {
      skill: "read",
      articleId: id,
      sourceId: o.sourceId,
      title: saved.title,
      sentence: o.sentence,
      form: o.form,
      href: `/read/${id}#${o.sourceId}`,
    });
  }
  return saved;
}
export async function localPracticeState() {
  return browserData(false, (data) => data.practice);
}
export async function localPracticeMaterial(
  id: string,
): Promise<PracticeMaterial> {
  if (id.startsWith("word:")) {
    const word = [...(await localWords()), ...sampleVocabulary()].find(
      (w) => w.id === id.slice(5),
    );
    if (word) return materialFromWord(word);
  }
  const state = await localPracticeState();
  const material = [...state.materials, ...practiceSamples].find(
    (m) => m.id === id,
  );
  if (!material)
    throw new AppError("这个浏览器中没有该材料，请重新选择。", 404);
  return material;
}
export async function saveLocalPractice(value: StudyWrite) {
  const input = studyWriteSchema.parse(value);
  if (input.kind !== "materials") {
    const m = await localPracticeMaterial(input.value.mid);
    if (!m.paragraphs.some((p) => p.id === input.value.pid))
      throw new AppError("材料段落不存在。");
  }
  return browserData(true, (data) => {
    if (input.kind === "materials") {
      if (
        data.practice.materials.length >= 200 &&
        !data.practice.materials.some((m) => m.id === input.id)
      )
        throw new AppError("材料已达到 200 份，请先整理。");
      data.practice.materials = [
        input.value,
        ...data.practice.materials.filter((m) => m.id !== input.id),
      ];
    } else if (input.kind === "history") {
      data.practice.history = [
        input.value,
        ...data.practice.history.filter((h) => h.id !== input.id),
      ].slice(0, 1000);
    } else {
      if ((data.practice.progress[input.id]?.at ?? 0) > input.value.at) return;
      data.practice.progress[input.id] = input.value;
    }
    return input.value;
  });
}
export async function saveLocalPracticeWord(input: PracticeWordInput) {
  const m = await localPracticeMaterial(input.materialId),
    p = m.paragraphs.find((p) => p.id === input.paragraphId);
  if (!p) throw new AppError("材料段落不存在。");
  const contained = p.text
    .toLocaleLowerCase(m.lang)
    .includes(input.form.toLocaleLowerCase(m.lang));
  const authored =
    input.form === m.phrase &&
    input.meaning === m.meaning &&
    (m.wordId ||
      practiceSamples.some(
        (s) =>
          s.id === m.id &&
          s.paragraphs[0].id === p.id &&
          s.paragraphs[0].text === p.text,
      ));
  if (!contained && !authored)
    throw new AppError("请选择原文里实际出现的表达。");
  const word = await browserData(true, (data) => {
    let w = input.vocabularyId
      ? data.words[input.vocabularyId]
      : Object.values(data.words).find(
          (w) =>
            w.language === m.lang &&
            normalizeLemma(w.lemma, m.lang) ===
              normalizeLemma(input.form, m.lang) &&
            w.meaning === input.meaning,
        );
    if (
      input.vocabularyId &&
      (!w || w.language !== m.lang || w.meaning !== input.meaning)
    )
      throw new AppError("词条或义项不属于这个语境。");
    if (!w) {
      const id = `local-word-${crypto.randomUUID()}`;
      w = {
        id,
        language: m.lang,
        lemma: input.form,
        meaning: input.meaning,
        partOfSpeech: "phrase",
        grammar: {
          article: "",
          plural: "",
          infinitive: "",
          currentForm: "",
          note: "",
        },
        explanation: "连同练习中的原段落一起保存的表达。",
        example: p.text,
        exampleTranslation: p.zh,
        user: initialUser(),
        appearances: [],
      };
      data.words[id] = w;
    }
    w.user ??= initialUser();
    w.user.favorite = true;
    if (w.user.status === "NEW") {
      w.user.status = "LEARNING";
      w.user.dueAt = new Date().toISOString();
    }
    if (
      !w.appearances.some(
        (a) =>
          a.skill === input.skill &&
          a.articleId === m.id &&
          a.sourceId === p.id,
      )
    ) {
      w.appearances.push({
        skill: input.skill,
        articleId: m.id,
        sourceId: p.id,
        title: m.title,
        form: contained ? input.form : p.text,
        sentence: p.text,
        href: `/${input.skill}?material=${encodeURIComponent(m.id)}&paragraph=${encodeURIComponent(p.id)}`,
      });
      w.user.exposureCount++;
    }
    return w;
  });
  window.dispatchEvent(new Event("wordweave:vocabulary"));
  return word;
}
