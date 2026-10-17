import { randomUUID } from "node:crypto";
import { type ExtensionJob, Prisma } from "@prisma/client";
import { db, userScope } from "./db";
import { AppError } from "./errors";
import { getDatabaseErrorCode } from "./database-config";
import { generateArticle, modelConfigured } from "./generation";
import { getArticle, assertArticleQuota, scopedRequestKey } from "./repository";
import { settingsSchema } from "./schemas";
import { prepareExtensionArticle } from "./extension-input";
import { safeExtensionArticle } from "./extension-output";

const activeStatuses = ["pending", "running"];
const pendingLifetime = 2 * 60_000;
const runningLifetime = 6 * 60_000;
const timeoutMessage =
  "生成任务因服务重启或超时而中断。原文和已有学习版已保留，请点击重试。";
export type ExtensionJobStatus = "pending" | "running" | "succeeded" | "failed";

function summary(job: ExtensionJob) {
  return { id: job.articleId, status: job.status as ExtensionJobStatus };
}

async function withJobLock<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      // All creation, retries and claims share a short PostgreSQL transaction lock.
      // No model/network work runs while holding it; this works across app processes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1694772026)`;
      return action(tx);
    },
    { timeout: 15000 },
  );
}

async function expireJobs(tx: Prisma.TransactionClient, now: Date) {
  const expired = await tx.extensionJob.findMany({
    where: {
      ...userScope(),
      status: { in: activeStatuses },
      expiresAt: { lte: now },
    },
  });
  for (const job of expired) {
    // Revoke the exact article claim before checking for a completed version.
    // This row update serializes against saveVersion's final token CAS: either
    // the committed version is visible below, or the stale save is rolled back.
    if (job.runToken) {
      await tx.article.updateMany({
        where: {
          id: job.articleId,
          ...userScope(),
          generationToken: job.runToken,
        },
        data: {
          generationToken: null,
          generationStartedAt: null,
          generationError: timeoutMessage,
          generationProgress: Prisma.DbNull,
        },
      });
    }
    const article = await tx.article.findUnique({
      where: { id: job.articleId },
      select: { activeVersionId: true },
    });
    // A process may stop after committing the version but before finalizing its
    // job. Reconcile that success without repeating a billable model request.
    const succeeded = Boolean(
      article?.activeVersionId && article.activeVersionId !== job.baseVersionId,
    );
    await tx.extensionJob.updateMany({
      where: {
        articleId: job.articleId,
        status: job.status,
        runToken: job.runToken,
        expiresAt: { lte: now },
      },
      data: {
        status: succeeded ? "succeeded" : "failed",
        error: succeeded ? null : timeoutMessage,
        runToken: null,
        finishedAt: now,
      },
    });
  }
}

async function assertCapacity(tx: Prisma.TransactionClient, now: Date) {
  const active = await tx.extensionJob.count({
    where: { status: { in: activeStatuses }, expiresAt: { gt: now } },
  });
  if (active >= 2)
    throw new AppError("已有两篇文章正在处理，请等待其中一篇完成后再试。", 429);
}

function requireModel() {
  if (!modelConfigured())
    throw new AppError(
      "生成需要先在服务端配置模型 API。请配置 LLM_API_KEY、LLM_BASE_URL 和 LLM_MODEL。",
      503,
    );
}

export async function createExtensionJob(raw: unknown) {
  const {
    input,
    blocks,
    requestKey: clientKey,
    requestHash,
  } = prepareExtensionArticle(raw);
  const requestKey = scopedRequestKey(clientKey, "extension");
  return withJobLock(async (tx) => {
    const now = new Date();
    await expireJobs(tx, now);
    const previous =
      (await tx.extensionJob.findUnique({ where: { requestKey } })) ??
      (userScope().ownerId === "personal"
        ? await tx.extensionJob.findFirst({
            where: { requestKey: clientKey, ownerId: "personal" },
          })
        : null);
    if (previous) {
      if (
        previous.ownerId !== userScope().ownerId ||
        previous.requestHash !== requestHash
      ) {
        throw new AppError(
          "该请求标识已用于其他内容，请为新内容创建新的请求标识。",
          409,
        );
      }
      // Preserve idempotency across the upgrade from the personal-only plugin.
      // The payload hash and owner must both match before migrating its key.
      if (previous.requestKey !== requestKey)
        await tx.extensionJob.update({
          where: { articleId: previous.articleId },
          data: { requestKey },
        });
      return summary(previous);
    }
    requireModel();
    await assertCapacity(tx, now);
    await assertArticleQuota(tx);
    const settings = settingsSchema.parse({ retention: input.retention });
    const article = await tx.article.create({
      data: {
        ...userScope(),
        title: input.title,
        sourceUrl: input.sourceUrl,
        mode: "tech",
        language: "en",
        origin: "extension-imported",
        sourceText: input.blocks.map((block) => block.markdown).join("\n\n"),
        sourceBlocks: JSON.parse(JSON.stringify(blocks)),
        draftSettings: JSON.parse(JSON.stringify(settings)),
      },
    });
    const job = await tx.extensionJob.create({
      data: {
        ...userScope(),
        articleId: article.id,
        requestKey,
        requestHash,
        retention: input.retention,
        expiresAt: new Date(now.getTime() + pendingLifetime),
      },
    });
    return summary(job);
  });
}

export async function retryExtensionJob(id: string) {
  return withJobLock(async (tx) => {
    const now = new Date();
    await expireJobs(tx, now);
    const job = await tx.extensionJob.findFirst({
      where: { articleId: id, ...userScope() },
    });
    if (!job) throw new AppError("插件任务不存在或文章已删除。", 404);
    if (job.status !== "failed") return summary(job);
    requireModel();
    await assertCapacity(tx, now);
    const article = await tx.article.findUniqueOrThrow({ where: { id } });
    if (article.generationToken)
      throw new AppError("这篇文章正在其他页面生成，请稍后重试。", 409);
    const updated = await tx.extensionJob.update({
      where: { articleId: id },
      data: {
        status: "pending",
        error: null,
        runToken: null,
        startedAt: null,
        finishedAt: null,
        baseVersionId: article.activeVersionId,
        expiresAt: new Date(now.getTime() + pendingLifetime),
      },
    });
    return summary(updated);
  });
}

export async function getExtensionJob(id: string) {
  const job = await withJobLock(async (tx) => {
    await expireJobs(tx, new Date());
    const found = await tx.extensionJob.findFirst({
      where: { articleId: id, ...userScope() },
    });
    if (!found) throw new AppError("插件任务不存在或文章已删除。", 404);
    return found;
  });
  return {
    ...summary(job),
    ...(job.error ? { error: job.error } : {}),
    ...(job.status === "succeeded"
      ? { article: safeExtensionArticle(await getArticle(id)) }
      : {}),
  };
}

async function claimJob(id: string) {
  return withJobLock(async (tx) => {
    const now = new Date();
    await expireJobs(tx, now);
    const job = await tx.extensionJob.findFirst({
      where: { articleId: id, ...userScope(), status: "pending" },
    });
    if (!job) return null;
    const runToken = randomUUID();
    const articleClaim = await tx.article.updateMany({
      where: {
        id,
        ...userScope(),
        generationToken: null,
        activeVersionId: job.baseVersionId,
      },
      data: {
        generationToken: runToken,
        generationStartedAt: now,
        generationError: null,
        generationProgress: Prisma.DbNull,
      },
    });
    if (!articleClaim.count) {
      await tx.extensionJob.update({
        where: { articleId: id },
        data: {
          status: "failed",
          error: "文章已在其他页面生成或更新，请检查文章后重试。",
          finishedAt: now,
        },
      });
      return null;
    }
    return tx.extensionJob.update({
      where: { articleId: id },
      data: {
        status: "running",
        runToken,
        startedAt: now,
        attempts: { increment: 1 },
        expiresAt: new Date(now.getTime() + runningLifetime),
      },
    });
  });
}

export async function runExtensionJob(id: string) {
  let claim: ExtensionJob | null = null;
  try {
    claim = await claimJob(id);
    if (!claim?.runToken) return;
    const runToken = claim.runToken;
    const settings = settingsSchema.parse({ retention: claim.retention });
    await generateArticle(id, settings, claim.runToken);
    await withJobLock((tx) =>
      tx.extensionJob.updateMany({
        where: {
          articleId: id,
          ...userScope(),
          status: "running",
          runToken,
        },
        data: {
          status: "succeeded",
          error: null,
          runToken: null,
          finishedAt: new Date(),
        },
      }),
    );
  } catch (error) {
    if (!claim?.runToken) {
      console.error(
        "[extension] Could not claim job:",
        getDatabaseErrorCode(error),
      );
      return;
    }
    // Only controlled application messages may be persisted or sent to clients.
    const message =
      error instanceof AppError
        ? error.message
        : "生成未完成。原文和已有学习版已保留，请稍后重试。";
    try {
      await withJobLock(async (tx) => {
        const article = await tx.article.findUnique({
          where: { id },
          select: { activeVersionId: true },
        });
        const succeeded = Boolean(
          article?.activeVersionId &&
          article.activeVersionId !== claim!.baseVersionId,
        );
        await tx.extensionJob.updateMany({
          where: {
            articleId: id,
            ...userScope(),
            status: "running",
            runToken: claim!.runToken,
          },
          data: {
            status: succeeded ? "succeeded" : "failed",
            error: succeeded ? null : message,
            runToken: null,
            finishedAt: new Date(),
          },
        });
        await tx.article.updateMany({
          where: { id, ...userScope(), generationToken: claim!.runToken },
          data: {
            generationToken: null,
            generationStartedAt: null,
            generationError: succeeded ? null : message,
            generationProgress: Prisma.DbNull,
          },
        });
      });
    } catch (persistenceError) {
      // A persisted running lease will become an explicit retryable failure on
      // polling after expiry, even if this process loses database access now.
      console.error(
        "[extension] Could not finalize job:",
        getDatabaseErrorCode(persistenceError),
      );
    }
  }
}
