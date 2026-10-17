import { db } from "./db";
import { AppError } from "./errors";

const GLOBAL_OWNER = "$global";
const LEASE_MILLISECONDS = 6 * 60_000;
const BUDGET_LOCK = 1694772027;

type PermitInput = {
  ownerId: string;
  articleId: string;
  token: string;
  inputChars: number;
};

function limit(name: string, fallback: number, maximum: number): number {
  const configured = process.env[name]?.trim();
  if (!configured) return fallback;
  if (!/^\d+$/.test(configured))
    throw new AppError(
      `${name} 配置无效：必须是 0 到 ${maximum} 的整数。`,
      503,
    );
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value > maximum)
    throw new AppError(
      `${name} 配置无效：必须是 0 到 ${maximum} 的整数。`,
      503,
    );
  return value;
}

/** A generation reserves capacity before any provider request, including retries.
 * Counts are input-work limits, not a promise about a provider's dollar charges.
 * Failed generations keep their reservation because a provider may have billed.
 */
export async function acquireGenerationPermit({
  ownerId,
  articleId,
  token,
  inputChars,
}: PermitInput): Promise<() => Promise<void>> {
  if (
    !ownerId ||
    ownerId === GLOBAL_OWNER ||
    ownerId.length > 200 ||
    !articleId ||
    articleId.length > 200 ||
    !token ||
    token.length > 200 ||
    !Number.isSafeInteger(inputChars) ||
    inputChars < 0 ||
    inputChars > 10_000_000
  ) {
    throw new AppError("生成额度参数无效，请重新发起生成。", 400);
  }
  const limits = {
    personalCount: limit("GENERATION_DAILY_LIMIT", 20, 1000),
    personalChars: limit("GENERATION_DAILY_CHAR_LIMIT", 120000, 10_000_000),
    globalCount: limit("GENERATION_GLOBAL_DAILY_LIMIT", 100, 10000),
    globalChars: limit(
      "GENERATION_GLOBAL_DAILY_CHAR_LIMIT",
      600000,
      100_000_000,
    ),
    globalConcurrent: limit("GENERATION_MAX_CONCURRENT", 2, 20),
  };
  if (Object.values(limits).some((value) => value === 0))
    throw new AppError(
      "生成服务已暂时停用，请联系网站维护者。已有文章仍可阅读。",
      429,
    );

  await db.$transaction(
    async (tx) => {
      // One PostgreSQL lock covers all counters and leases across app processes.
      // It is released by the transaction before any network/model work starts.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BUDGET_LOCK})`;
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const existing = await tx.generationPermit.findUnique({
        where: { token },
      });
      if (existing) {
        if (existing.ownerId !== ownerId || existing.articleId !== articleId)
          throw new AppError(
            "生成请求标识已用于其他任务，请重新发起生成。",
            409,
          );
        if (existing.releasedAt || existing.expiresAt <= now)
          throw new AppError("本次生成许可已结束，请重新发起生成。", 409);
        // A duplicate call with the active token does not consume a second quota.
        // The article's generation-token claim prevents duplicate model workers.
        return;
      }

      const active = { releasedAt: null, expiresAt: { gt: now } };
      if (await tx.generationPermit.count({ where: { ...active, ownerId } }))
        throw new AppError("你已有一篇文章正在生成，请等它完成后再试。", 429);
      if (
        (await tx.generationPermit.count({ where: active })) >=
        limits.globalConcurrent
      )
        throw new AppError("网站当前生成任务较多，请稍后再试。", 429);

      const [personal, global] = await Promise.all([
        tx.generationUsage.findUnique({
          where: { ownerId_day: { ownerId, day } },
        }),
        tx.generationUsage.findUnique({
          where: { ownerId_day: { ownerId: GLOBAL_OWNER, day } },
        }),
      ]);
      if ((personal?.count ?? 0) >= limits.personalCount)
        throw new AppError(
          `你今日的 ${limits.personalCount} 次生成额度已用完，请在 UTC 次日再试。失败的生成也可能计入额度。`,
          429,
        );
      if ((personal?.inputChars ?? 0) + inputChars > limits.personalChars)
        throw new AppError(
          `本次输入会超过你今日 ${limits.personalChars.toLocaleString("en-US")} 字符的生成额度，请缩短文章或在 UTC 次日再试。`,
          429,
        );
      if ((global?.count ?? 0) >= limits.globalCount)
        throw new AppError(
          "网站今日的生成次数额度已用完，请在 UTC 次日再试。已有文章仍可阅读。",
          429,
        );
      if ((global?.inputChars ?? 0) + inputChars > limits.globalChars)
        throw new AppError(
          "网站今日剩余的生成字符额度不足，请缩短文章或在 UTC 次日再试。",
          429,
        );

      for (const bucket of [ownerId, GLOBAL_OWNER]) {
        await tx.generationUsage.upsert({
          where: { ownerId_day: { ownerId: bucket, day } },
          create: { ownerId: bucket, day, count: 1, inputChars },
          update: {
            count: { increment: 1 },
            inputChars: { increment: inputChars },
          },
        });
      }
      await tx.generationPermit.create({
        data: {
          token,
          ownerId,
          articleId,
          expiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
        },
      });
    },
    { timeout: 15000, maxWait: 15000 },
  );

  return async () => {
    // Keep the token record for idempotency. Expired/released leases stop counting
    // toward concurrency, but neither release nor expiry erases daily usage.
    await db.generationPermit.updateMany({
      where: { token, ownerId, articleId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
  };
}
