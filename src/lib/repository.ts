import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, userScope } from "./db";
import { AppError } from "./errors";
import { parseSource, type SourceBlock } from "./markdown";
import { normalizeLemma, reviewUpdate, selectReviewWords } from "./review";
import type { Generation, Settings, Term } from "./schemas";
import type { ArticleDetail, Coverage, Word } from "./types";
const json = (value: unknown) => value as Prisma.InputJsonValue;
export async function requireArticle(id: string) {
  const a = await db.article.findFirst({ where: { id, ...userScope() } });
  if (!a) throw new AppError("文章不存在或已删除", 404);
  return a;
}
export async function listArticles(mode?: string) {
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
        ...a,
        versions: undefined,
        level: (version?.settings as Settings | undefined)?.level,
        sourceBlocks: undefined,
        sourceText: undefined,
        generationToken: undefined,
        ownerId: undefined,
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
              include: {
                vocabulary: { include: { users: { where: userScope() } } },
              },
            },
          },
        })
      : null,
    db.readingProgress.findUnique({ where: { articleId: id } }),
    db.languagePreference.findUnique({
      where: { ownerId_language: { ...userScope(), language: a.language } },
    }),
  ]);
  const result = {
    ...a,
    sourceBlocks: a.sourceBlocks as SourceBlock[],
    defaultGlossMode: preference?.glossMode ?? "first",
    progress,
    version: version
      ? {
          ...version,
          occurrences: version.occurrences.map((o) => ({
            ...o,
            word: {
              ...o.vocabulary,
              grammar: {
                ...(o.vocabulary.grammar as Record<string, string>),
                ...(o.grammar as Record<string, string>),
              },
              explanation: o.explanation ?? o.vocabulary.explanation,
              example: o.example ?? o.vocabulary.example,
              exampleTranslation:
                o.exampleTranslation ?? o.vocabulary.exampleTranslation,
              user: o.vocabulary.users[0] ?? null,
            },
          })),
        }
      : null,
  };
  return JSON.parse(JSON.stringify(result)) as ArticleDetail;
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
  await db.article.createMany({
    data: {
      ...userScope(),
      requestKey: key,
      draftSettings: json(input.settings),
      title: input.title,
      mode: input.mode,
      language,
      sourceText: input.text,
      sourceBlocks: json(parseSource(input.text)),
      sourceUrl: input.sourceUrl || null,
      origin: input.text ? "imported" : "generated",
    },
    skipDuplicates: true,
  });
  const article = await db.article.findUniqueOrThrow({
    where: { requestKey: key },
  });
  await db.languagePreference.createMany({
    data: { ...userScope(), language, settings: json(input.settings) },
    skipDuplicates: true,
  });
  await db.languagePreference.update({
    where: { ownerId_language: { ...userScope(), language } },
    data: { settings: json(input.settings) },
  });
  return article;
}
export async function getReviewTargets(language = "de") {
  const words = await db.userVocabulary.findMany({
    where: {
      ...userScope(),
      vocabulary: { language },
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
    where: { ...userScope(), vocabulary: { language } },
    include: {
      vocabulary: {
        select: { lemma: true, meaning: true, partOfSpeech: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}
function vocabularyKey(language: string, t: Term) {
  return createHash("sha256")
    .update(
      [
        language,
        normalizeLemma(t.lemma, language),
        t.partOfSpeech,
        t.meaning.normalize("NFKC").trim(),
      ].join("|"),
    )
    .digest("hex");
}
export async function saveVersion(
  articleId: string,
  token: string,
  result: Generation,
  settings: Settings,
  coverage: Coverage,
  targets: Awaited<ReturnType<typeof getReviewTargets>>,
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
        if (matched) vocabularyId = matched.id;
        else {
          const v = await tx.vocabularyItem.upsert({
            where: { key: vocabularyKey(a.language, t) },
            create: {
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
      await tx.article.update({
        where: { id: articleId },
        data: {
          activeVersionId: version.id,
          generationToken: null,
          generationStartedAt: null,
          generationError: null,
          ...(!a.sourceText
            ? {
                sourceText: generatedSource,
                sourceBlocks: json(parseSource(generatedSource)),
              }
            : {}),
          ...(a.origin === "generated" ? { title: result.title } : {}),
        },
      });
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
  const existing = await db.userVocabulary.findUnique({
    where: { ownerId_vocabularyId: { ...userScope(), vocabularyId } },
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
) {
  const rows = await db.userVocabulary.findMany({
    where: {
      ...userScope(),
      ...(status ? { status } : {}),
      ...(favorite ? { favorite: true } : {}),
      vocabulary: { ...(language ? { language } : {}) },
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
      ...u.vocabulary,
      occurrences: undefined,
      user: { ...u, vocabulary: undefined },
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
