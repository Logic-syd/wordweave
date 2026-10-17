import { z } from "zod";

export const MAX_INPUT = 40000;
export const settingsSchema = z.object({
  retention: z.enum(["low", "medium", "high"]).default("medium"),
  level: z.enum(["A1", "A2", "B1"]).default("A2"),
  minutes: z.enum(["3-5", "5-8"]).default("3-5"),
  newWordCount: z.union([z.literal(3), z.literal(5), z.literal(8)]).default(5),
  topic: z.string().trim().min(1).max(120).default("购物"),
  requestedWords: z.string().trim().max(300).default(""),
  reviewOnly: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;
export const importSchema = z
  .object({
    title: z.string().trim().min(1, "请填写标题").max(120),
    mode: z.enum(["tech", "german"]),
    text: z.string().max(MAX_INPUT, "正文最多 40,000 个字符").default(""),
    sourceUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .max(2000)
          .refine((s) => /^https?:\/\//i.test(s), "仅支持 HTTP(S) 来源链接"),
      ])
      .optional(),
    settings: settingsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.mode === "tech" && !data.text.trim())
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "请粘贴英文正文",
      });
    if (data.text && !data.text.trim())
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "正文不能为空白",
      });
  });
export const termSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
  lemma: z.string().trim().min(1).max(140),
  partOfSpeech: z.enum([
    "noun",
    "verb",
    "phrase",
    "adjective",
    "adverb",
    "other",
  ]),
  meaning: z.string().trim().min(1).max(300),
  grammar: z.object({
    article: z.string().max(40).default(""),
    plural: z.string().max(100).default(""),
    infinitive: z.string().max(100).default(""),
    currentForm: z.string().max(100).default(""),
    note: z.string().max(800).default(""),
  }),
  explanation: z.string().min(1).max(1000),
  example: z.string().min(1).max(1200),
  exampleTranslation: z.string().min(1).max(1200),
  category: z.enum(["technical", "general"]).default("general"),
  reviewVocabularyId: z.string().optional(),
});
export const segmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(50000) }),
  z.object({
    type: z.literal("term"),
    text: z.string().min(1).max(250),
    termId: z.string(),
    meaning: z.string().min(1).max(300),
    sentence: z.string().min(1).max(2000),
    currentForm: z.string().max(150).optional(),
    grammarNote: z.string().max(800).optional(),
  }),
]);
export const generatedParagraphSchema = z.object({
  id: z.string(),
  segments: z.array(segmentSchema).min(1).max(500),
  original: z.string().max(50000).optional(),
});
export const generationSchema = z.object({
  title: z.string().min(1).max(120),
  terms: z.array(termSchema).max(100),
  paragraphs: z.array(generatedParagraphSchema).min(1).max(500),
});
export type Term = z.infer<typeof termSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Generation = z.infer<typeof generationSchema>;
export const progressSchema = z.object({
  paragraphId: z.string().max(80).nullable().optional(),
  view: z.enum(["learning", "original"]).optional(),
  glossMode: z.enum(["all", "first", "click"]).optional(),
  completed: z.boolean().optional(),
});
export const vocabularyUpdateSchema = z
  .object({
    status: z.enum(["LEARNING", "KNOWN", "IGNORED"]).optional(),
    favorite: z.boolean().optional(),
    category: z.enum(["technical", "general"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0);
