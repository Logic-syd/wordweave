import { Prisma } from "@prisma/client";
import { db, userScope } from "./db";
import { AppError } from "./errors";
import { materialFromWord, practiceSamples } from "./practice-content";
import {
  practiceHistorySchema,
  practiceMaterialSchema,
  practiceProgressSchema,
  type PracticeHistory,
  type PracticeMaterial,
  type PracticeProgress,
  type PracticeSkill,
  type PracticeWordInput,
  type StudyWrite,
} from "./practice-schemas";
import { publicWord, vocabularyKey } from "./repository";
import { getSample, listSamples } from "./samples";
import type { Word } from "./types";

const json = (value: unknown) => value as Prisma.InputJsonValue;
export type PracticeState = {
  materials: PracticeMaterial[];
  history: PracticeHistory[];
  progress: Partial<Record<PracticeSkill, PracticeProgress>>;
};
export async function getPracticeState(): Promise<PracticeState> {
  const groups = await Promise.all([
    db.studyItem.findMany({
      where: { ...userScope(), kind: { in: ["materials", "progress"] } },
      orderBy: { updatedAt: "desc" },
    }),
    db.studyItem.findMany({
      where: { ...userScope(), kind: "history" },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const rows = groups.flat();
  const state: PracticeState = { materials: [], history: [], progress: {} };
  for (const row of rows) {
    if (row.kind === "materials") {
      const value = practiceMaterialSchema.safeParse(row.value);
      if (value.success) state.materials.push(value.data);
    } else if (row.kind === "history") {
      const value = practiceHistorySchema.safeParse(row.value);
      if (value.success) state.history.push(value.data);
    } else if (row.id === "listen" || row.id === "speak") {
      const value = practiceProgressSchema.safeParse(row.value);
      if (value.success) state.progress[row.id] = value.data;
    }
  }
  return state;
}
export async function getPracticeWord(id: string): Promise<Word> {
  if (id.startsWith("sample-")) {
    for (const sample of listSamples()) {
      const word = getSample(sample.id)?.version?.occurrences.find(
        (o) => o.word.id === id,
      )?.word;
      if (word) return word;
    }
  } else {
    const word = await db.vocabularyItem.findFirst({
      where: { id, ...userScope() },
      include: { users: { where: userScope() } },
    });
    if (word) return publicWord(word, word.users[0]);
  }
  throw new AppError("词条不存在或不属于当前学习空间", 404);
}
export async function getPracticeMaterial(
  id: string,
): Promise<PracticeMaterial> {
  if (id.startsWith("word:"))
    return materialFromWord(await getPracticeWord(id.slice(5)));
  const owned = await db.studyItem.findUnique({
    where: { ownerId_kind_id: { ...userScope(), kind: "materials", id } },
  });
  if (owned) return practiceMaterialSchema.parse(owned.value);
  const sample = practiceSamples.find((m) => m.id === id);
  if (!sample)
    throw new AppError("这份练习材料已不存在，请重新选择材料。", 404);
  return sample;
}
export async function saveStudyItem(input: StudyWrite) {
  if (input.kind !== "materials") {
    const material = await getPracticeMaterial(input.value.mid);
    if (!material.paragraphs.some((p) => p.id === input.value.pid))
      throw new AppError("练习段落不存在，已保留当前输入。", 404);
  }
  return db.$transaction(async (tx) => {
    // Serialize a learner's writes so quota checks and rapid progress saves stay bounded.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1694772055, hashtext(${userScope().ownerId}))`;
    const where = {
      ownerId_kind_id: { ...userScope(), kind: input.kind, id: input.id },
    };
    const previous = await tx.studyItem.findUnique({ where });
    if (
      !previous &&
      input.kind !== "progress" &&
      (await tx.studyItem.count({
        where: { ...userScope(), kind: input.kind },
      })) >= (input.kind === "materials" ? 200 : 10000)
    )
      throw new AppError(
        input.kind === "materials"
          ? "材料已达到 200 份，请先整理已有材料。"
          : "练习记录已达到保存上限。",
        429,
      );
    // A delayed autosave must not overwrite a newer draft from another tab.
    if (input.kind === "progress" && previous) {
      const older = practiceProgressSchema.safeParse(previous.value);
      if (older.success && older.data.at > input.value.at) return previous;
    }
    return tx.studyItem.upsert({
      where,
      create: { ...userScope(), ...input, value: json(input.value) },
      update: { value: json(input.value) },
    });
  });
}
export async function savePracticeWord(
  input: PracticeWordInput,
): Promise<Word> {
  const material = await getPracticeMaterial(input.materialId);
  const paragraph = material.paragraphs.find((p) => p.id === input.paragraphId);
  if (!paragraph) throw new AppError("词条对应的练习段落不存在", 404);
  const contained = paragraph.text
    .toLocaleLowerCase(material.lang)
    .includes(input.form.toLocaleLowerCase(material.lang));
  const original = practiceSamples.find((m) => m.id === material.id);
  // Only a verified word example or the authored first paragraph can map a
  // dictionary phrase to an inflected/separable form. Imported metadata alone
  // must not invent coverage, nor can a material's phrase stand for paragraph 2.
  const authored =
    material.phrase === input.form &&
    material.meaning === input.meaning &&
    (Boolean(material.wordId) ||
      (original?.paragraphs[0].id === paragraph.id &&
        original.paragraphs[0].text === paragraph.text));
  if (!contained && !authored)
    throw new AppError("请选择这段原文中实际出现的表达，再填写释义。", 400);
  const sentence = contained
    ? (Array.from(
        new Intl.Segmenter(material.lang, { granularity: "sentence" }).segment(
          paragraph.text,
        ),
      )
        .find((s) =>
          s.segment
            .toLocaleLowerCase(material.lang)
            .includes(input.form.toLocaleLowerCase(material.lang)),
        )
        ?.segment.trim() ?? paragraph.text)
    : paragraph.text;
  const targetId =
    input.vocabularyId ??
    (material.wordId?.startsWith("sample-") ? undefined : material.wordId);
  const saved = await db.$transaction(async (tx) => {
    let vocabulary;
    if (targetId) {
      vocabulary = await tx.vocabularyItem.findFirst({
        where: { id: targetId, ...userScope(), language: material.lang },
      });
      if (!vocabulary || vocabulary.meaning !== input.meaning)
        throw new AppError("词条或义项不属于当前语境，请重新选择。", 409);
    } else {
      const term = {
        lemma: input.form,
        partOfSpeech: "phrase" as const,
        meaning: input.meaning,
      };
      const key = vocabularyKey(material.lang, term);
      vocabulary = await tx.vocabularyItem.upsert({
        where: { key },
        update: {},
        create: {
          ...userScope(),
          key,
          language: material.lang,
          ...term,
          grammar: {},
          explanation: "连同练习中的原段落一起保存的表达。",
          example: paragraph.text,
          exampleTranslation: paragraph.zh,
        },
      });
    }
    if (vocabulary.ownerId !== userScope().ownerId)
      throw new AppError("词条不属于当前学习空间", 404);
    const vocabularyId = vocabulary.id;
    const occurrence = await tx.practiceOccurrence.createMany({
      data: {
        ...userScope(),
        vocabularyId,
        skill: input.skill,
        materialId: material.id,
        paragraphId: paragraph.id,
        title: material.title,
        form: contained ? input.form : sentence,
        sentence,
      },
      skipDuplicates: true,
    });
    const where = { ownerId_vocabularyId: { ...userScope(), vocabularyId } };
    await tx.userVocabulary.upsert({
      where,
      create: {
        ...userScope(),
        vocabularyId,
        status: "LEARNING",
        favorite: true,
        dueAt: new Date(),
        exposureCount: occurrence.count,
      },
      update: {
        favorite: true,
        exposureCount: { increment: occurrence.count },
      },
    });
    await tx.userVocabulary.updateMany({
      where: { ...userScope(), vocabularyId, status: "NEW" },
      data: { status: "LEARNING", dueAt: new Date() },
    });
    const user = await tx.userVocabulary.findUniqueOrThrow({ where });
    return publicWord(vocabulary, user);
  });
  return saved;
}
