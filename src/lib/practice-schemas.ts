import { z } from "zod";

export const practiceSkillSchema = z.enum(["listen", "speak"]);
export type PracticeSkill = z.infer<typeof practiceSkillSchema>;
const identifier = z.string().min(1).max(180);
const language = z.enum(["en", "de"]);
export const practiceTaskSchema = z.enum([
  "listen",
  "dictation",
  "shadow",
  "retell",
  "oral",
  "understand",
]);
export type PracticeTask = z.infer<typeof practiceTaskSchema>;
export const practiceParagraphSchema = z.object({
  id: identifier,
  text: z.string().trim().min(1).max(16000),
  zh: z.string().max(24000).default(""),
  question: z.string().max(600).optional(),
  oral: z.string().max(680).optional(),
  points: z.array(z.string().max(420)).max(4).optional(),
  answerGuide: z.string().max(1000).optional(),
});
export const practiceMaterialSchema = z
  .object({
    id: identifier,
    title: z.string().trim().min(1).max(100),
    lang: language,
    level: z.enum(["", "A1", "A2", "B1"]).default(""),
    topic: z.string().max(120).default("我的材料"),
    paragraphs: z.array(practiceParagraphSchema).min(1).max(6),
    phrase: z.string().max(140).optional(),
    meaning: z.string().max(300).optional(),
    question: z.string().max(600).optional(),
    oral: z.string().max(680).optional(),
    wordId: identifier.optional(),
    at: z.number().finite().optional(),
  })
  .superRefine((m, ctx) => {
    if (m.paragraphs.reduce((n, p) => n + p.text.length, 0) > 16000)
      ctx.addIssue({
        code: "custom",
        message: "材料原文合计最多 16,000 个字符",
      });
    if (new Set(m.paragraphs.map((p) => p.id)).size !== m.paragraphs.length)
      ctx.addIssue({ code: "custom", message: "材料段落 ID 不能重复" });
  });
export type PracticeMaterial = z.infer<typeof practiceMaterialSchema>;
const point = z.object({
  label: z.string().min(1).max(240),
  status: z.enum(["met", "partial", "missed"]),
  explanation: z.string().max(700),
});
export const practiceAiGradeSchema = z.object({
  method: z.enum(["ai", "openai"]).optional(),
  points: z.array(point).min(1).max(4),
  correction: z.string().max(900),
  example: z.string().min(1).max(1600),
  review: z
    .array(
      z.object({
        text: z.string().min(1).max(220),
        reason: z.string().max(450),
      }),
    )
    .max(2),
});
const dictationGrade = z.object({
  method: z.literal("dictation"),
  score: z.number().min(0).max(100),
  total: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  extra: z.number().int().nonnegative(),
  substitutions: z.number().int().nonnegative(),
  groupCount: z.number().int().nonnegative(),
  differences: z
    .array(
      z.object({ expected: z.string().max(220), actual: z.string().max(220) }),
    )
    .max(12),
});
const selfGrade = z.object({
  method: z.literal("self"),
  points: z.array(point).min(1).max(4),
});
export const practiceGradeSchema = z.union([
  dictationGrade,
  selfGrade,
  practiceAiGradeSchema,
]);
export type PracticeGrade = z.infer<typeof practiceGradeSchema>;
export const practiceHistorySchema = z.object({
  id: identifier,
  skill: practiceSkillSchema,
  mid: identifier,
  pid: identifier,
  type: practiceTaskSchema,
  title: z.string().max(100),
  lang: language,
  answer: z.string().max(8000),
  link: z
    .union([
      z.literal(""),
      z
        .url()
        .max(2000)
        .refine((s) => /^https?:\/\//i.test(s)),
    ])
    .default(""),
  at: z.number().finite(),
  reference: z.object({
    source: z.string().max(16000),
    question: z.string().max(1600),
    lang: language,
    cues: z.array(z.string().max(420)).max(4).default([]),
  }),
  grade: practiceGradeSchema.optional(),
});
export type PracticeHistory = z.infer<typeof practiceHistorySchema>;
export const practiceProgressSchema = z.object({
  mid: identifier,
  pid: identifier,
  task: practiceTaskSchema,
  answer: z.string().max(8000).default(""),
  revealed: z.boolean().default(false),
  bilingual: z.boolean().default(true),
  speed: z.number().min(0.5).max(1.5).default(0.9),
  at: z.number().finite(),
});
export type PracticeProgress = z.infer<typeof practiceProgressSchema>;
export const studyWriteSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("materials"),
      id: identifier,
      value: practiceMaterialSchema,
    }),
    z.object({
      kind: z.literal("history"),
      id: identifier,
      value: practiceHistorySchema,
    }),
    z.object({
      kind: z.literal("progress"),
      id: practiceSkillSchema,
      value: practiceProgressSchema,
    }),
  ])
  .superRefine((input, ctx) => {
    if (input.kind !== "progress" && input.id !== input.value.id)
      ctx.addIssue({ code: "custom", message: "记录 ID 不一致" });
    if (input.kind === "materials" && input.value.wordId)
      ctx.addIssue({
        code: "custom",
        message: "词库练习来源由服务器关联，不能在导入材料中指定",
      });
    if (
      input.kind === "progress" &&
      (input.id === "listen") !==
        ["listen", "dictation", "understand"].includes(input.value.task)
    )
      ctx.addIssue({ code: "custom", message: "练习类型与页面不一致" });
    if (
      input.kind === "history" &&
      (input.value.skill === "listen") !==
        ["listen", "dictation", "understand"].includes(input.value.type)
    )
      ctx.addIssue({ code: "custom", message: "记录的练习类型与页面不一致" });
  });
export type StudyWrite = z.infer<typeof studyWriteSchema>;
export const practiceWordSchema = z.object({
  skill: practiceSkillSchema,
  materialId: identifier,
  paragraphId: identifier,
  form: z.string().trim().min(1).max(140),
  meaning: z.string().trim().min(1).max(300),
  vocabularyId: identifier.optional(),
});
export type PracticeWordInput = z.infer<typeof practiceWordSchema>;
export const gradeInputSchema = z.object({
  lang: language,
  type: z.enum(["listen", "understand", "retell", "oral"]),
  source: z.string().trim().min(1).max(16000),
  question: z.string().max(1600),
  answer: z.string().trim().min(1).max(8000),
});
export const materialInputSchema = z
  .object({
    lang: language,
    level: z.enum(["", "A1", "A2", "B1"]).default(""),
    paragraphs: z.array(z.string().trim().min(1).max(16000)).min(1).max(6),
  })
  .refine(
    (v) => v.paragraphs.reduce((n, p) => n + p.length, 0) <= 16000,
    "原文最多 16,000 个字符",
  );
export const materialResultSchema = z.object({
  paragraphs: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        zh: z.string().min(1).max(24000),
        question: z.string().min(1).max(600),
        answerGuide: z.string().min(1).max(1000),
        oral: z.string().min(1).max(680),
        points: z.array(z.string().min(1).max(420)).min(1).max(4),
      }),
    )
    .min(1)
    .max(6),
});
