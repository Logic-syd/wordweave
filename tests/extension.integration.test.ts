// Real PostgreSQL with isolated ownership; model transport is deliberately mocked.
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "../src/lib/db";
import {
  createExtensionJob,
  getExtensionJob,
  retryExtensionJob,
  runExtensionJob,
} from "../src/lib/extension-jobs";
import { generateArticle } from "../src/lib/generation";
import { saveVersion, updateWord } from "../src/lib/repository";
import {
  settingsSchema,
  termSchema,
  type Generation,
} from "../src/lib/schemas";

const hooks = vi.hoisted(() => ({
  owner: "extension-integration-" + crypto.randomUUID(),
  afterArticleRead: undefined as undefined | (() => Promise<void>),
}));
vi.mock("../src/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/db")>();
  const extended = actual.db.$extends({
    query: {
      article: {
        async findFirst({ args, query }) {
          const result = await query(args);
          if (hooks.afterArticleRead) await hooks.afterArticleRead();
          return result;
        },
      },
    },
  });
  return {
    ...actual,
    db: extended,
    userScope: () => ({ ownerId: hooks.owner }),
  };
});

const settings = settingsSchema.parse({});
const source = "State changes are queued. Use `setState(x)` carefully.";
const code = '```js\nconst untouched = "<code>";\n```';
function input() {
  return {
    title: "extension test",
    sourceUrl: "https://example.com/test",
    retention: "medium",
    requestKey: randomUUID(),
    blocks: [
      { id: "b0", markdown: source },
      { id: "b1", markdown: code },
    ],
  };
}
const term = termSchema.parse({
  id: "queued",
  lemma: "queue",
  partOfSpeech: "verb",
  meaning: "加入测试队列：" + hooks.owner,
  grammar: {},
  explanation: "queue 在这里作动词。",
  example: "State changes are queued.",
  exampleTranslation: "状态变化会加入队列。",
});
function result(): Generation {
  return {
    title: "队列",
    terms: [term],
    paragraphs: [
      {
        id: "b0",
        segments: [
          { type: "text", text: "状态变化会 " },
          {
            type: "term",
            text: "queued",
            termId: "queued",
            meaning: term.meaning,
            sentence: term.example,
          },
          { type: "text", text: "。请谨慎使用 ⟦PROTECTED_0_0⟧。" },
        ],
      },
    ],
  };
}
function envelope() {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: JSON.stringify(result()) },
          finish_reason: "stop",
        },
      ],
    }),
    { status: 200 },
  );
}
function mockSuccess() {
  const transport = vi.fn(async () => envelope());
  vi.stubGlobal("fetch", transport);
  return transport;
}
beforeAll(() => {
  vi.stubEnv("LLM_API_KEY", "extension-test-placeholder");
  vi.stubEnv("LLM_BASE_URL", "http://127.0.0.1:9999/v1");
  vi.stubEnv("LLM_MODEL", "extension-test-fixture");
});
afterEach(async () => {
  hooks.afterArticleRead = undefined;
  vi.unstubAllGlobals();
  const touched = await db.userVocabulary.findMany({
    where: { ownerId: hooks.owner },
    select: { vocabularyId: true },
  });
  await db.article.deleteMany({ where: { ownerId: hooks.owner } });
  await db.userVocabulary.deleteMany({ where: { ownerId: hooks.owner } });
  await db.languagePreference.deleteMany({ where: { ownerId: hooks.owner } });
  await db.vocabularyItem.deleteMany({
    where: {
      id: { in: touched.map((word) => word.vocabularyId) },
      occurrences: { none: {} },
      users: { none: {} },
    },
  });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("extension jobs, persisted retries and ownership", () => {
  it("deduplicates concurrent submissions/workers, protects code and returns stable paragraph IDs", async () => {
    const payload = input();
    const transport = mockSuccess();
    const [first, second] = await Promise.all([
      createExtensionJob(payload),
      createExtensionJob(payload),
    ]);
    expect(first).toEqual(second);
    await Promise.all([runExtensionJob(first.id), runExtensionJob(first.id)]);
    expect(transport).toHaveBeenCalledTimes(1);
    const saved = await getExtensionJob(first.id);
    expect(saved.status).toBe("succeeded");
    expect(
      saved.article?.version?.paragraphs.map((paragraph) => paragraph.sourceId),
    ).toEqual(["b0", "b1"]);
    expect(saved.article?.version?.paragraphs[1].segments[0].text).toBe(code);
    expect(saved.article?.sourceText).toBe(`${source}\n\n${code}`);
    expect(JSON.stringify(saved)).not.toMatch(
      /generationToken|runToken|ownerId|requestKey|extension-test-placeholder/,
    );
    expect(await retryExtensionJob(first.id)).toEqual({
      id: first.id,
      status: "succeeded",
    });
    expect((await createExtensionJob(payload)).status).toBe("succeeded");
    expect(transport).toHaveBeenCalledTimes(1);
    const word = saved.article!.version!.occurrences[0].vocabularyId;
    await updateWord(word, { favorite: true });
    expect(
      (await getExtensionJob(first.id)).article?.version?.occurrences[0].word
        .user?.favorite,
    ).toBe(true);
  });

  it("rejects changed payloads under an existing key and caps pending/running work at two", async () => {
    const payload = input();
    await createExtensionJob(payload);
    await expect(
      createExtensionJob({ ...payload, retention: "high" }),
    ).rejects.toMatchObject({ status: 409 });
    const outcomes = await Promise.allSettled([
      createExtensionJob(input()),
      createExtensionJob(input()),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    const denied = outcomes.find(
      (outcome) => outcome.status === "rejected",
    ) as PromiseRejectedResult;
    expect(denied.reason).toMatchObject({ status: 429 });
    expect(await db.article.count({ where: { ownerId: hooks.owner } })).toBe(2);
  });

  it("persists failed API calls and only generates again after an explicit idempotent retry", async () => {
    const payload = input();
    const transport = vi.fn(
      async () => new Response("private provider detail", { status: 401 }),
    );
    vi.stubGlobal("fetch", transport);
    const job = await createExtensionJob(payload);
    await runExtensionJob(job.id);
    const failed = await getExtensionJob(job.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("模型服务拒绝访问");
    expect(failed.error).not.toContain("private provider detail");
    const attempts = transport.mock.calls.length;
    expect((await createExtensionJob(payload)).status).toBe("failed");
    await runExtensionJob(job.id);
    expect(transport).toHaveBeenCalledTimes(attempts);
    const retry = await Promise.all([
      retryExtensionJob(job.id),
      retryExtensionJob(job.id),
    ]);
    expect(retry[0]).toEqual(retry[1]);
    const success = mockSuccess();
    await Promise.all([runExtensionJob(job.id), runExtensionJob(job.id)]);
    expect(success).toHaveBeenCalledTimes(1);
    expect((await getExtensionJob(job.id)).status).toBe("succeeded");
    expect(
      (
        await db.extensionJob.findUniqueOrThrow({
          where: { articleId: job.id },
        })
      ).attempts,
    ).toBe(2);
  });

  it("expires interrupted work, revokes only its token and rejects late callbacks before billing", async () => {
    const transport = mockSuccess();
    const job = await createExtensionJob(input());
    const oldToken = randomUUID();
    await db.extensionJob.update({
      where: { articleId: job.id },
      data: {
        status: "running",
        runToken: oldToken,
        startedAt: new Date(0),
        expiresAt: new Date(0),
      },
    });
    await db.article.update({
      where: { id: job.id },
      data: { generationToken: oldToken, generationStartedAt: new Date(0) },
    });
    const failed = await getExtensionJob(job.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("中断");
    expect(
      (await db.article.findUniqueOrThrow({ where: { id: job.id } }))
        .generationToken,
    ).toBeNull();
    await expect(
      generateArticle(job.id, settings, oldToken),
    ).rejects.toMatchObject({ status: 409 });
    expect(transport).not.toHaveBeenCalled();
    await retryExtensionJob(job.id);
    await runExtensionJob(job.id);
    expect((await getExtensionJob(job.id)).status).toBe("succeeded");
  });

  it("keeps a successful website version when an explicit extension retry later fails", async () => {
    const job = await createExtensionJob(input());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    await runExtensionJob(job.id);
    mockSuccess();
    const versionId = await generateArticle(job.id, settings);
    await retryExtensionJob(job.id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    await runExtensionJob(job.id);
    expect((await getExtensionJob(job.id)).status).toBe("failed");
    const article = await db.article.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(article.activeVersionId).toBe(versionId);
    expect(article.generationToken).toBeNull();
    expect(
      await db.articleVersion.count({ where: { articleId: job.id } }),
    ).toBe(1);
  });

  it("reconciles a saved version after interruption instead of billing for it again", async () => {
    const transport = mockSuccess();
    const job = await createExtensionJob(input());
    await runExtensionJob(job.id);
    await db.extensionJob.update({
      where: { articleId: job.id },
      data: {
        status: "running",
        runToken: randomUUID(),
        expiresAt: new Date(0),
      },
    });
    expect((await getExtensionJob(job.id)).status).toBe("succeeded");
    expect((await retryExtensionJob(job.id)).status).toBe("succeeded");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rolls back an obsolete save if its token is revoked after the transaction read", async () => {
    const job = await createExtensionJob(input());
    const oldToken = randomUUID();
    const newToken = randomUUID();
    await db.article.update({
      where: { id: job.id },
      data: { generationToken: oldToken },
    });
    let resume!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    hooks.afterArticleRead = async () => {
      hooks.afterArticleRead = undefined;
      entered();
      await gate;
    };
    const saving = saveVersion(
      job.id,
      oldToken,
      result(),
      settings,
      {
        newWords: [term.lemma],
        reviewWords: [],
        requestedNew: 1,
        requestedReview: 0,
        missing: [],
      },
      [],
    );
    await reached;
    await db.article.update({
      where: { id: job.id },
      data: { generationToken: newToken },
    });
    resume();
    await expect(saving).rejects.toMatchObject({ status: 409 });
    expect(
      await db.articleVersion.count({ where: { articleId: job.id } }),
    ).toBe(0);
    expect(
      await db.userVocabulary.count({ where: { ownerId: hooks.owner } }),
    ).toBe(0);
    expect(
      (await db.article.findUniqueOrThrow({ where: { id: job.id } }))
        .generationToken,
    ).toBe(newToken);
  });
});
