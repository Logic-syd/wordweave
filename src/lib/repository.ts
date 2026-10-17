import { createHash } from "node:crypto";
import {
  Prisma,
  type UserVocabulary,
  type VocabularyItem,
} from "@prisma/client";
import { db, userScope } from "./db";
import { AppError } from "./errors";
import { parseSource, type SourceBlock } from "./markdown";
import { normalizeLemma, reviewUpdate, selectReviewWords } from "./review";
import type { Generation, Settings, Term } from "./schemas";
import type {
  ArticleDetail,
  Coverage,
  GenerationProgress,
  LibraryArticle,
  UserWord,
  VocabularyView,
  Word,
} from "./types";
const json = (value: unknown) => value as Prisma.InputJsonValue;

function publicUserWord(
  user: UserVocabulary | null | undefined,
): UserWord | null {
  return user
    ? {
        status: user.status,
        favorite: user.favorite,
        category: user.category,
        exposureCount: user.exposureCount,
        reviewCount: user.reviewCount,
        knownStreak: user.knownStreak,
        dueAt: user.dueAt?.toISOString() ?? null,
      }
    : null;
}

function publicWord(
  vocabulary: VocabularyItem,
  user: UserVocabulary | null | undefined,
): Word {
  return {
    id: vocabulary.id,
    language: vocabulary.language,
    lemma: vocabulary.lemma,
    partOfSpeech: vocabulary.partOfSpeech,
    meaning: vocabulary.meaning,
    grammar: vocabulary.grammar as Term["grammar"],
    explanation: vocabulary.explanation,
    example: vocabulary.example,
    exampleTranslation: vocabulary.exampleTranslation,
    user: publicUserWord(user),
  };
}

export function scopedRequestKey(key: string, namespace = "article") {
  return createHash("sha256")
    .update(JSON.stringify([namespace, userScope().ownerId, key]))
    .digest("hex");
}

async function lockArticleOwner(tx: Prisma.TransactionClient) {
  const { ownerId } = userScope();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1694772027, hashtext(${ownerId}))`;
}

export async function assertArticleQuota(tx: Prisma.TransactionClient) {
  await lockArticleOwner(tx);
  if ((await tx.article.count({ where: userScope() })) >= 200)
    throw new AppError(
      "文章库已达到试用上限（200 篇），请先删除不需要的文章。",
      429,
    );
}

export async function requireArticle(id: string) {
  const a = await db.article.findFirst({ where: { id, ...userScope() } });
  if (!a) throw new AppError("文章不存在或已删除", 404);
  return a;
}
export async function listArticles(mode?: string): Promise<LibraryArticle[]> {
  const rows = await db.article.findMany({
    where: { ...userScope(), ...(mode ? { mode } : {}) },
    include: {
      progress: true,
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { paragraphs: { orderBy: { position: "asc" }, take: 3 } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .sort(
      (a, b) =>
        (b.progress?.updatedAt ?? b.updatedAt).getTime() -
        (a.progress?.updatedAt ?? a.updatedAt).getTime(),
    )
    .map((a) => {
      const version = a.versions[0];
      const preview =
        version?.paragraphs
          .filter((p) => !p.original.startsWith("#"))
          .map((p) =>
            (p.segments as { text: string }[]).map((s) => s.text).join(""),
          )
          .join(" ") || a.sourceText;
      return {
        id: a.id,
        title: a.title,
        mode: a.mode,
        origin: a.origin,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        activeVersionId: a.activeVersionId,
        generationStartedAt: a.generationStartedAt?.toISOString() ?? null,
        generationError: a.generationError,
        progress: a.progress
          ? {
              paragraphId: a.progress.paragraphId,
              completed: a.progress.completed,
              updatedAt: a.progress.updatedAt.toISOString(),
            }
          : null,
        level: (version?.settings as Settings | undefined)?.level,
        preview: preview.replace(/[#*`>]/g, "").slice(0, 110),
      };
    });
}
export async function getArticle(id: string): Promise<ArticleDetail> {
  const a = await requireArticle(id);
  const [version, progress, preference] = await Promise.all([
    a.activeVersionId
      ? db.articleVersion.findFirst({
          where: { id: a.activeVersionId, articleId: id },
          include: {
            paragraphs: { orderBy: { position: "asc" } },
            occurrences: {
              where: { vocabulary: userScope() },
              include: {
                vocabulary: { include: { users: { where: userScope() } } },
              },
            },
          },
        })
      : null,
    db.readingProgress.findFirst({ where: { articleId: id, ...userScope() } }),
    db.languagePreference.findUnique({
      where: { ownerId_language: { ...userScope(), language: a.language } },
    }),
  ]);
  return {
    id: a.id,
    title: a.title,
    mode: a.mode,
    language: a.language,
    sourceUrl: a.sourceUrl,
    sourceText: a.sourceText,
    sourceBlocks: a.sourceBlocks as SourceBlock[],
    origin: a.origin,
    generationStartedAt: a.generationStartedAt?.toISOString() ?? null,
    generationError: a.generationError,
    generationProgress: a.generationProgress as GenerationProgress | null,
    createdAt: a.createdAt.toISOString(),
    defaultGlossMode: preference?.glossMode ?? "first",
    progress: progress
      ? {
          paragraphId: progress.paragraphId,
          view: progress.view,
          glossMode: progress.glossMode,
          completed: progress.completed,
        }
      : null,
    version: version
      ? {
          id: version.id,
          settings: version.settings as Settings,
          coverage: version.coverage as Coverage,
          createdAt: version.createdAt.toISOString(),
          paragraphs: version.paragraphs.map((paragraph) => ({
            id: paragraph.id,
            sourceId: paragraph.sourceId,
            position: paragraph.position,
            original: paragraph.original,
            segments:
              paragraph.segments as Generation["paragraphs"][number]["segments"],
          })),
          occurrences: version.occurrences.map((o) => ({
            id: o.id,
            vocabularyId: o.vocabularyId,
            sourceId: o.sourceId,
            form: o.form,
            meaning: o.meaning,
            sentence: o.sentence,
            targetKind: o.targetKind,
            word: {
              ...publicWord(o.vocabulary, o.vocabulary.users[0]),
              grammar: {
                ...(o.vocabulary.grammar as Term["grammar"]),
                ...(o.grammar as Record<string, string>),
              },
              explanation: o.explanation ?? o.vocabulary.explanation,
              example: o.example ?? o.vocabulary.example,
              exampleTranslation:
                o.exampleTranslation ?? o.vocabulary.exampleTranslation,
            },
          })),
        }
      : null,
  };
}
export async function createArticle(
  input: {
    title: string;
    mode: string;
    text: string;
    sourceUrl?: string;
    settings: Settings;
  },
  key: string,
) {
  const language = input.mode === "tech" ? "en" : "de";
  const scope = userScope();
  const requestKey = scopedRequestKey(key);
  const hashPayload = (payload: typeof input) =>
    createHash("sha256")
      .update(
        JSON.stringify({
          title: payload.title,
          mode: payload.mode,
          text: payload.text,
          sourceUrl: payload.sourceUrl || null,
          // PostgreSQL JSONB can reorder object keys. Rebuild the schema order
          // before comparing a pre-invitation article with the submitted data.
          settings: {
            retention: payload.settings?.retention,
            level: payload.settings?.level,
            minutes: payload.settings?.minutes,
            newWordCount: payload.settings?.newWordCount,
            topic: payload.settings?.topic,
            requestedWords: payload.settings?.requestedWords,
            reviewOnly: payload.settings?.reviewOnly,
          },
        }),
      )
      .digest("hex");
  const requestHash = hashPayload(input);
  const sourceBlocks = json(parseSource(input.text));
  return db.$transaction(
    async (tx) => {
      // Serialize duplicate submissions and quota checks for this owner only.
      // An idempotent retry remains valid even when the library is now full.
      await lockArticleOwner(tx);
      const previous = await tx.article.findUnique({ where: { requestKey } });
      if (previous) {
        if (
          previous.ownerId !== scope.ownerId ||
          previous.requestHash !== requestHash
        )
          throw new AppError(
            "该请求标识已用于其他内容，请重新提交新文章。",
            409,
          );
        return previous;
      }
      if (scope.ownerId === "personal") {
        const legacy = await tx.article.findFirst({
          where: { requestKey: key, ...scope },
        });
        if (legacy) {
          const legacyHash =
            legacy.requestHash ??
            hashPayload({
              title: legacy.title,
              mode: legacy.mode,
              text: legacy.sourceText,
              sourceUrl: legacy.sourceUrl ?? undefined,
              settings: legacy.draftSettings as Settings,
            });
          if (legacyHash !== requestHash)
            throw new AppError(
              "该请求标识已用于其他内容，请重新提交新文章。",
              409,
            );
          return tx.article.update({
            where: { id: legacy.id, ...scope },
            data: { requestKey, requestHash },
          });
        }
      }
      await assertArticleQuota(tx);
      const article = await tx.article.create({
        data: {
          ...scope,
          requestKey,
          requestHash,
          draftSettings: json(input.settings),
          title: input.title,
          mode: input.mode,
          language,
          sourceText: input.text,
          sourceBlocks,
          sourceUrl: input.sourceUrl || null,
          origin: input.text ? "imported" : "generated",
        },
      });
      await tx.languagePreference.upsert({
        where: { ownerId_language: { ...scope, language } },
        create: { ...scope, language, settings: json(input.settings) },
        update: { settings: json(input.settings) },
      });
      return article;
    },
    { timeout: 15000 },
  );
}
export async function getReviewTargets(language = "de") {
  const words = await db.userVocabulary.findMany({
    where: {
      ...userScope(),
      vocabulary: { language, ...userScope() },
      status: { in: ["LEARNING", "KNOWN"] },
      dueAt: { lte: new Date() },
    },
    include: { vocabulary: true },
  });
  return selectReviewWords(words).map((w) => ({
    id: w.vocabularyId,
    lemma: w.vocabulary.lemma,
    meaning: w.vocabulary.meaning,
    partOfSpeech: w.vocabulary.partOfSpeech,
    grammar: w.vocabulary.grammar,
  }));
}
export async function getKnownWords(language: string) {
  return db.userVocabulary.findMany({
    where: { ...userScope(), vocabulary: { language, ...userScope() } },
    include: {
      vocabulary: {
        select: { lemma: true, meaning: true, partOfSpeech: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}
function vocabularyKey(language: string, t: Term) {
  const { ownerId } = userScope();
  const original = [
    language,
    normalizeLemma(t.lemma, language),
    t.partOfSpeech,
    t.meaning.normalize("NFKC").trim(),
  ].join("|");
  return (
    createHash("sha256")
      // Preserve existing personal dictionaries while separating every invitee's
      // context-specific examples and explanations from other owners.
      .update(
        ownerId === "personal" ? original : JSON.stringify([ownerId, original]),
      )
      .digest("hex")
  );
}
export async function saveVersion(
  articleId: string,
  token: string,
  result: Generation,
  settings: Settings,
  coverage: Coverage,
  targets: Awaited<ReturnType<typeof getReviewTargets>>,
  options: { savePreferences?: boolean } = {},
) {
  return db.$transaction(
    async (tx) => {
      const a = await tx.article.findFirst({
        where: { id: articleId, ...userScope(), generationToken: token },
      });
      if (!a) throw new AppError("生成任务已过期，请重试", 409);
      const version = await tx.articleVersion.create({
        data: { articleId, settings: json(settings), coverage: json(coverage) },
      });
      const termMap = new Map<string, string>();
      const used = new Set(
        result.paragraphs.flatMap((p) =>
          p.segments.filter((s) => s.type === "term").map((s) => s.termId),
        ),
      );
      const exposedVocabulary = new Set<string>();
      for (const t of result.terms.filter((t) => used.has(t.id))) {
        const matched = t.reviewVocabularyId
          ? targets.find((r) => r.id === t.reviewVocabularyId)
          : undefined;
        let vocabularyId: string;
        if (t.reviewVocabularyId) {
          const owned =
            matched &&
            (await tx.vocabularyItem.findFirst({
              where: {
                id: matched.id,
                ...userScope(),
                language: a.language,
                users: { some: userScope() },
              },
              select: { id: true },
            }));
          if (!owned)
            throw new AppError("复习词不属于当前学习空间，已拒绝保存。", 409);
          vocabularyId = owned.id;
        } else {
          const v = await tx.vocabularyItem.upsert({
            where: { key: vocabularyKey(a.language, t) },
            create: {
              ...userScope(),
              key: vocabularyKey(a.language, t),
              language: a.language,
              lemma: t.lemma,
              partOfSpeech: t.partOfSpeech,
              meaning: t.meaning,
              grammar: json(t.grammar),
              explanation: t.explanation,
              example: t.example,
              exampleTranslation: t.exampleTranslation,
            },
            update: {},
          });
          if (v.ownerId !== userScope().ownerId)
            throw new AppError("词条不属于当前学习空间，已拒绝保存。", 409);
          vocabularyId = v.id;
        }
        termMap.set(t.id, vocabularyId);
        if (!exposedVocabulary.has(vocabularyId))
          await tx.userVocabulary.upsert({
            where: { ownerId_vocabularyId: { ...userScope(), vocabularyId } },
            create: {
              ...userScope(),
              vocabularyId,
              exposureCount: 1,
              category: a.mode === "tech" ? t.category : null,
            },
            update: { exposureCount: { increment: 1 } },
          });
        exposedVocabulary.add(vocabularyId);
      }
      for (const [position, p] of result.paragraphs.entries()) {
        const segments = [];
        for (const s of p.segments) {
          if (s.type === "text") {
            segments.push(s);
            continue;
          }
          const t = result.terms.find((t) => t.id === s.termId)!;
          const occurrence = await tx.occurrence.create({
            data: {
              versionId: version.id,
              vocabularyId: termMap.get(s.termId)!,
              sourceId: p.id,
              form: s.text,
              meaning: s.meaning,
              sentence: s.sentence,
              grammar: json({
                ...t.grammar,
                ...(s.currentForm ? { currentForm: s.currentForm } : {}),
                ...(s.grammarNote ? { note: s.grammarNote } : {}),
              }),
              explanation: t.explanation,
              example: t.example,
              exampleTranslation: t.exampleTranslation,
              targetKind: t.reviewVocabularyId ? "review" : "new",
            },
          });
          segments.push({ ...s, occurrenceId: occurrence.id });
        }
        await tx.paragraph.create({
          data: {
            versionId: version.id,
            sourceId: p.id,
            position,
            original: p.original ?? "",
            segments: json(segments),
          },
        });
      }
      const generatedSource = result.paragraphs
        .map((p) => p.original ?? "")
        .join("\n\n");
      const saved = await tx.article.updateMany({
        where: { id: articleId, ...userScope(), generationToken: token },
        data: {
          activeVersionId: version.id,
          generationToken: null,
          generationStartedAt: null,
          generationError: null,
          generationProgress: Prisma.DbNull,
          ...(!a.sourceText
            ? {
                sourceText: generatedSource,
                sourceBlocks: json(parseSource(generatedSource)),
              }
            : {}),
          ...(a.origin === "generated" ? { title: result.title } : {}),
        },
      });
      if (!saved.count) throw new AppError("生成任务已过期，请重试", 409);
      if (options.savePreferences !== false) {
        await tx.languagePreference.createMany({
          data: {
            ...userScope(),
            language: a.language,
            settings: json(settings),
          },
          skipDuplicates: true,
        });
        await tx.languagePreference.update({
          where: { ownerId_language: { ...userScope(), language: a.language } },
          data: { settings: json(settings) },
        });
      }
      return version.id;
    },
    { timeout: 30000 },
  );
}
export async function saveProgress(
  id: string,
  data: {
    paragraphId?: string | null;
    view?: string;
    glossMode?: string;
    completed?: boolean;
  },
) {
  const article = await requireArticle(id);
  if (
    data.paragraphId &&
    !(article.sourceBlocks as SourceBlock[]).some(
      (b) => b.id === data.paragraphId,
    )
  )
    throw new AppError("阅读段落不存在");
  return db.$transaction(async (tx) => {
    const p = await tx.readingProgress.upsert({
      where: { articleId: id },
      create: { articleId: id, ...userScope(), ...data },
      update: data,
    });
    if (data.glossMode)
      await tx.languagePreference.upsert({
        where: {
          ownerId_language: { ...userScope(), language: article.language },
        },
        create: {
          ...userScope(),
          language: article.language,
          glossMode: data.glossMode,
          settings: {},
        },
        update: { glossMode: data.glossMode },
      });
    return p;
  });
}
export async function updateWord(
  vocabularyId: string,
  data: {
    status?: "LEARNING" | "KNOWN" | "IGNORED";
    favorite?: boolean;
    category?: string;
  },
) {
  const existing = await db.userVocabulary.findFirst({
    where: { ...userScope(), vocabularyId, vocabulary: userScope() },
  });
  if (!existing) throw new AppError("词条不存在", 404);
  return db.userVocabulary.update({
    where: { id: existing.id },
    data: {
      ...(data.favorite !== undefined
        ? {
            favorite: data.favorite,
            ...(data.favorite && existing.status === "NEW" && !data.status
              ? { status: "LEARNING", dueAt: new Date() }
              : {}),
          }
        : {}),
      ...(data.category ? { category: data.category } : {}),
      ...(data.status
        ? {
            ...reviewUpdate(data.status, existing.knownStreak),
            reviewCount: { increment: 1 },
          }
        : {}),
    },
  });
}
export async function listVocabulary(
  language?: string,
  status?: string,
  favorite = false,
): Promise<(VocabularyView & { user: UserWord })[]> {
  const rows = await db.userVocabulary.findMany({
    where: {
      ...userScope(),
      ...(status ? { status } : {}),
      ...(favorite ? { favorite: true } : {}),
      vocabulary: { ...userScope(), ...(language ? { language } : {}) },
    },
    include: {
      vocabulary: {
        include: {
          occurrences: {
            where: { version: { article: userScope() } },
            include: {
              version: {
                select: {
                  articleId: true,
                  article: { select: { title: true, activeVersionId: true } },
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((u) => {
    const appearances = u.vocabulary.occurrences
      .filter((o) => o.version.article.activeVersionId === o.versionId)
      .map((o) => ({
        articleId: o.version.articleId,
        title: o.version.article.title,
        sentence: o.sentence,
        form: o.form,
        sourceId: o.sourceId,
      }));
    return {
      ...publicWord(u.vocabulary, u),
      user: publicUserWord(u)!,
      appearances,
    };
  });
}
export async function deleteArticle(id: string) {
  await requireArticle(id);
  await db.article.delete({ where: { id } });
}
export function asWord(value: unknown) {
  return value as Word;
}
