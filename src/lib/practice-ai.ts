import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { handleAi } from "../../workbench/server/ai.mjs";
import { db, userScope } from "./db";
import { AppError, apiError } from "./errors";
import {
  acquireGenerationPermit,
  reserveModelRequest,
} from "./generation-budget";
import {
  materialResultSchema,
  practiceAiGradeSchema,
} from "./practice-schemas";

type Context = { owner: string; id: string; kind: string };
const where = (c: Context) => ({ ownerId: c.owner, kind: c.kind, id: c.id });
const json = (text: string) => JSON.parse(text) as Prisma.InputJsonValue;
const cache = {
  async read(c: Context) {
    const row = await db.studyItem.findUnique({
      where: { ownerId_kind_id: where(c) },
    });
    return row ? { value: JSON.stringify(row.value) } : null;
  },
  async claim(lease: string, staleBefore: number, c: Context) {
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1694772056, hashtext(${c.owner + ":" + c.id}))`;
      const key = { ownerId_kind_id: where(c) };
      const existing = await tx.studyItem.findUnique({ where: key });
      if (existing) {
        const value = existing.value as { started?: number; result?: unknown };
        if (
          value.result ||
          typeof value.started !== "number" ||
          value.started >= staleBefore
        )
          return null;
      }
      await tx.studyItem.upsert({
        where: key,
        create: { ...where(c), value: json(lease) },
        update: { value: json(lease) },
      });
      return { id: c.id };
    });
  },
  async save(lease: string, value: string, c: Context) {
    return db.studyItem.updateMany({
      where: { ...where(c), value: { equals: json(lease) } },
      data: { value: json(value) },
    });
  },
  async release(lease: string, c: Context) {
    return db.studyItem.deleteMany({
      where: { ...where(c), value: { equals: json(lease) } },
    });
  },
};
export async function practiceAi(request: Request, action: string) {
  const ownerId = userScope().ownerId;
  return handleAi(
    request,
    {
      ...Object.fromEntries(
        [
          "LLM_API_KEY",
          "LLM_BASE_URL",
          "LLM_MODEL",
          "LLM_THINKING",
          "LLM_MAX_OUTPUT_TOKENS",
          "LLM_MAX_RESPONSE_BYTES",
        ].map((name) => [name, process.env[name]]),
      ),
      AI_CACHE: cache,
      async beforeModelCall({ input, id }: { input: unknown; id: string }) {
        const claim = {
          ownerId,
          articleId: `practice:${id}`,
          token: randomUUID(),
          inputChars: JSON.stringify(input).length,
        };
        const release = await acquireGenerationPermit(claim);
        try {
          await reserveModelRequest(claim);
        } catch (error) {
          await release();
          throw error;
        }
        return release;
      },
      validateResult(kind: string, result: unknown) {
        const checked = (
          kind === "grade" ? practiceAiGradeSchema : materialResultSchema
        ).safeParse(result);
        if (!checked.success)
          throw new AppError("学习反馈未通过校验，答案和材料已保留。", 502);
      },
      failureResponse(error: unknown) {
        return error instanceof AppError ? apiError(error) : undefined;
      },
    },
    ownerId,
    action,
  );
}
