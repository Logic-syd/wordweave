import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors";
import { parseSource, type SourceBlock } from "./markdown";

export const extensionArticleSchema = z
  .object({
    title: z.string().trim().min(1, "请提供文章标题").max(120),
    sourceUrl: z
      .url()
      .max(2000)
      .refine((url) => /^https?:\/\//i.test(url), "仅支持 HTTP(S) 来源链接"),
    blocks: z
      .array(
        z.object({
          id: z
            .string()
            .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, "段落 ID 不合法"),
          markdown: z.string().min(1).max(20000),
        }),
      )
      .min(1, "没有可翻译的正文")
      .max(80, "一次最多翻译 80 个段落"),
    retention: z.enum(["low", "medium", "high"]).default("medium"),
    requestKey: z.uuid(),
  })
  .superRefine((input, context) => {
    if (
      input.blocks.reduce((total, block) => total + block.markdown.length, 0) >
      20000
    ) {
      context.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "一次正文最多 20,000 个字符，请缩小选区。",
      });
    }
    if (
      new Set(input.blocks.map((block) => block.id)).size !==
      input.blocks.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "段落 ID 不可重复。",
      });
    }
  });

export type ExtensionArticleInput = z.infer<typeof extensionArticleSchema>;

export function prepareExtensionArticle(raw: unknown) {
  const input = extensionArticleSchema.parse(raw);
  const blocks: SourceBlock[] = input.blocks.map((inputBlock, index) => {
    const parsed = parseSource(inputBlock.markdown);
    if (parsed.length !== 1) {
      throw new AppError(
        "每个网页段落必须对应一个非空 Markdown 块，请重新提取正文。",
        400,
      );
    }
    const block = parsed[0];
    // Each paragraph is parsed separately; give protected markers globally
    // unique indices before sending several paragraphs in the same model call.
    const rename = (token: string) =>
      token.replace(/^⟦PROTECTED_0_/, `⟦PROTECTED_${index}_`);
    return {
      ...block,
      id: inputBlock.id,
      masked: block.masked.replace(/⟦PROTECTED_0_\d+⟧/g, rename),
      protected: Object.fromEntries(
        Object.entries(block.protected).map(([key, value]) => [
          rename(key),
          value,
        ]),
      ),
    };
  });
  const { requestKey, ...content } = input;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(content))
    .digest("hex");
  return { input, blocks, requestKey, requestHash };
}
