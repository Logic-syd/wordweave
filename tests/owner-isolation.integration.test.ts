import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { temporaryDatabase } from "./helpers/local-database";
import { runAsOwner } from "../src/lib/auth-context";
import { db } from "../src/lib/db";
import { createArticle, getArticle, listArticles } from "../src/lib/repository";
import { createExtensionJob } from "../src/lib/extension-jobs";
import { prepareExtensionArticle } from "../src/lib/extension-input";
import { settingsSchema } from "../src/lib/schemas";

let isolated: Awaited<ReturnType<typeof temporaryDatabase>> | undefined;
const input = {
  title: "Owned article",
  mode: "tech",
  text: "State updates are queued.",
  settings: settingsSchema.parse({}),
};
beforeAll(async () => {
  isolated = await temporaryDatabase();
  vi.stubEnv("DATABASE_URL", isolated.url);
  vi.stubEnv("LLM_API_KEY", "unused-local-fixture");
  vi.stubEnv("LLM_BASE_URL", "http://127.0.0.1:9999/v1");
  vi.stubEnv("LLM_MODEL", "unused-local-fixture");
}, 45000);
afterAll(async () => {
  await db.$disconnect();
  await isolated?.cleanup();
  vi.unstubAllEnvs();
});

describe("owner-scoped creation with real PostgreSQL", () => {
  it("reuses matching personal requests created before owner-key isolation instead of starting duplicate work", async () => {
    const key = randomUUID();
    const legacy = await db.article.create({
      data: {
        ownerId: "personal",
        requestKey: key,
        title: input.title,
        mode: input.mode,
        language: "en",
        sourceText: input.text,
        sourceBlocks: [],
        draftSettings: input.settings,
        origin: "imported",
      },
    });
    const migrated = await runAsOwner("personal", () =>
      createArticle(input, key),
    );
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.requestKey).not.toBe(key);
    const extensionInput = {
      title: "Legacy extension request",
      sourceUrl: "https://example.com",
      retention: "medium",
      requestKey: randomUUID(),
      blocks: [{ id: "b0", markdown: input.text }],
    };
    const { requestHash } = prepareExtensionArticle(extensionInput);
    await db.extensionJob.create({
      data: {
        ownerId: "personal",
        articleId: legacy.id,
        requestKey: extensionInput.requestKey,
        requestHash,
        retention: "medium",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const resumed = await runAsOwner("personal", () =>
      createExtensionJob(extensionInput),
    );
    expect(resumed.id).toBe(legacy.id);
    expect(await db.extensionJob.count()).toBe(1);
    await expect(
      runAsOwner("personal", () =>
        createExtensionJob({ ...extensionInput, retention: "high" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("serializes duplicate submissions, scopes equal client keys, and refuses payload changes", async () => {
    const key = randomUUID();
    const [first, duplicate] = await runAsOwner("alice", () =>
      Promise.all([createArticle(input, key), createArticle(input, key)]),
    );
    expect(first.id).toBe(duplicate.id);
    const other = await runAsOwner("bob", () => createArticle(input, key));
    expect(other.id).not.toBe(first.id);
    await expect(
      runAsOwner("alice", () =>
        createArticle({ ...input, text: "Different private text." }, key),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      runAsOwner("bob", () => getArticle(first.id)),
    ).rejects.toMatchObject({ status: 404 });
    const articles = await runAsOwner("alice", listArticles);
    expect(articles.map((article) => article.id)).toEqual([first.id]);
    const detail = await runAsOwner("alice", () => getArticle(first.id));
    for (const field of [
      "ownerId",
      "requestKey",
      "requestHash",
      "generationToken",
    ])
      expect(detail).not.toHaveProperty(field);
  });

  it("enforces the shared article cap atomically for both web and extension without blocking valid retries", async () => {
    const ownerId = "quota-owner";
    await db.article.createMany({
      data: Array.from({ length: 199 }, (_, i) => ({
        ownerId,
        title: `quota ${i}`,
        mode: "tech",
        language: "en",
        sourceText: "Local quota fixture.",
        sourceBlocks: [],
        origin: "imported",
      })),
    });
    const key = randomUUID();
    const otherKey = randomUUID();
    const results = await runAsOwner(ownerId, () =>
      Promise.allSettled([
        createArticle(input, key),
        createArticle(input, otherKey),
      ]),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(
      rejected && rejected.status === "rejected" && rejected.reason.status,
    ).toBe(429);
    expect(await db.article.count({ where: { ownerId } })).toBe(200);
    const successfulIndex = results.findIndex(
      (result) => result.status === "fulfilled",
    );
    await expect(
      runAsOwner(ownerId, () =>
        createArticle(input, successfulIndex === 0 ? key : otherKey),
      ),
    ).resolves.toHaveProperty("id");
    await expect(
      runAsOwner(ownerId, () =>
        createExtensionJob({
          title: "Quota extension",
          sourceUrl: "https://example.com",
          retention: "medium",
          requestKey: randomUUID(),
          blocks: [{ id: "b0", markdown: input.text }],
        }),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(await db.extensionJob.count({ where: { ownerId } })).toBe(0);
  });
});
