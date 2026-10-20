import { build } from "esbuild";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtensionResponse } from "../extension/src/protocol";
import type { ArticleDetail, UserWord, VocabularyView } from "../src/lib/types";

let workerCode = "";
const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const configKey = "wordweave.config";
const libraryKey = "wordweave.local.library";
const legacyServer = "https://old-learning.example";
const legacyToken = "old-server-token-never-to-send";
const apiKey = "personal-ai-key-test-fixture";
const freeConfig = {
  translationMode: "free",
  aiBaseUrl: "https://api.deepseek.com/v1",
  aiApiKey: "",
  aiModel: "",
  retention: "medium",
  glossMode: "first",
  serverUrl: legacyServer,
  accessToken: legacyToken,
};
const aiConfig = {
  ...freeConfig,
  translationMode: "ai",
  aiApiKey: apiKey,
  aiModel: "fixture-model-a",
};
const pageSender = {
  id: extensionId,
  url: "https://developer.example/react",
  frameId: 0,
  tab: { id: 7, url: "https://developer.example/react" },
};
const uiSender = {
  id: extensionId,
  url: `chrome-extension://${extensionId}/options.html`,
};
const librarySender = {
  id: extensionId,
  url: `chrome-extension://${extensionId}/library.html?article=local_example`,
};
const startMessage = {
  type: "ww:job:start",
  retention: "medium",
  translationMode: "free",
  input: {
    title: "React state",
    sourceUrl: pageSender.url,
    blocks: [{ id: "b0", markdown: "React batches state updates." }],
  },
};
type ArticleInput = typeof startMessage.input;
type TranslationContext = {
  id: string;
  mode: "free" | "ai";
  retention: string;
  ai?: { baseUrl: string; apiKey: string; model: string };
  onProgress?: (value: {
    stage: string;
    completed: number;
    total: number;
  }) => void;
};
type Store = Record<string, unknown>;
type Sender = {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number; url?: string };
};
type Handler = (
  message: unknown,
  sender: Sender,
  respond: (value: ExtensionResponse) => void,
) => boolean;
type Translate = (
  input: ArticleInput,
  context: TranslationContext,
) => Promise<ArticleDetail>;
type Job = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  article?: ArticleDetail;
  error?: string;
};
type Library = {
  articles: ArticleDetail[];
  words: VocabularyView[];
  jobs: Job[];
  localOnly: boolean;
};

function fixtureArticle(
  input: ArticleInput,
  context: TranslationContext,
): ArticleDetail {
  const wordId = `word_${context.id}`;
  const now = new Date().toISOString();
  return {
    id: context.id,
    title: input.title,
    mode: "tech",
    language: "en",
    sourceUrl: input.sourceUrl,
    sourceText: input.blocks.map((block) => block.markdown).join("\n\n"),
    sourceBlocks: input.blocks.map((block) => ({
      id: block.id,
      kind: "paragraph",
      original: block.markdown,
      masked: block.markdown,
      protected: {},
    })),
    origin: "extension-local",
    generationStartedAt: null,
    generationError: null,
    createdAt: now,
    defaultGlossMode: "first",
    progress: null,
    version: {
      id: `version_${context.id}`,
      createdAt: now,
      settings: {
        retention: context.retention as "low" | "medium" | "high",
        level: "A2",
        minutes: "3-5",
        newWordCount: 5,
        topic: "购物",
        requestedWords: "",
        reviewOnly: false,
      },
      coverage: {
        newWords: ["batch state updates"],
        reviewWords: [],
        requestedNew: 1,
        requestedReview: 0,
        missing: [],
      },
      paragraphs: input.blocks.map((block, position) => ({
        id: `paragraph_${context.id}_${position}`,
        sourceId: block.id,
        position,
        original: block.markdown,
        segments: [{ type: "text", text: "React 会批量处理状态更新。" }],
      })),
      occurrences: [
        {
          id: `occurrence_${context.id}`,
          vocabularyId: wordId,
          sourceId: input.blocks[0].id,
          form: "batch state updates",
          meaning: "批量处理状态更新",
          sentence: input.blocks[0].markdown,
          targetKind: "new",
          word: {
            id: wordId,
            language: "en",
            lemma: "batch state updates",
            partOfSpeech: "phrase",
            meaning: "批量处理状态更新",
            grammar: {
              article: "",
              plural: "",
              infinitive: "",
              currentForm: "",
              note: "",
            },
            explanation: "一组更新合并处理。",
            example: input.blocks[0].markdown,
            exampleTranslation: "React 会批量处理状态更新。",
            user: {
              status: "NEW",
              favorite: false,
              category: "technical",
              exposureCount: 1,
              reviewCount: 0,
              knownStreak: 0,
              dueAt: null,
            },
          },
        },
      ],
    },
  };
}

function createWorker(
  options: {
    store?: Store;
    granted?: string[];
    translate?: Translate;
    failStorage?: () => boolean;
  } = {},
) {
  const store = options.store ?? {};
  const granted = new Set(options.granted ?? []);
  let handler: Handler | undefined;
  const fetch = vi.fn(async () => {
    throw new Error("Unexpected website request or unmocked transport");
  });
  const translate = vi.fn(
    options.translate ??
      (async (input, context) => {
        context.onProgress?.({ stage: "translating", completed: 1, total: 1 });
        return fixtureArticle(input, context);
      }),
  );
  const discoverModels = vi.fn(async () => [
    "fixture-model-a",
    "fixture-model-b",
  ]);
  const setAccessLevel = vi.fn(async () => undefined);
  const get = vi.fn(async (keys?: string | string[] | Store | null) => {
    if (keys == null) return structuredClone(store);
    if (typeof keys === "string")
      return structuredClone({ [keys]: store[keys] });
    const names = Array.isArray(keys) ? keys : Object.keys(keys);
    return structuredClone(
      Object.fromEntries(names.map((key) => [key, store[key]])),
    );
  });
  const set = vi.fn(async (value: Store) => {
    if (options.failStorage?.() && libraryKey in value)
      throw new Error("QUOTA_BYTES quota exceeded");
    Object.assign(store, structuredClone(value));
  });
  const chrome = {
    runtime: {
      id: extensionId,
      getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
      onMessage: {
        addListener: (listener: Handler) => {
          handler = listener;
        },
      },
      onInstalled: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
      openOptionsPage: vi.fn(),
    },
    storage: {
      local: {
        setAccessLevel,
        get,
        set,
        remove: async (keys: string | string[]) => {
          for (const key of typeof keys === "string" ? [keys] : keys)
            delete store[key];
        },
        getBytesInUse: async () =>
          new TextEncoder().encode(JSON.stringify(store)).length,
      },
    },
    permissions: {
      contains: vi.fn(async ({ origins }: { origins: string[] }) =>
        origins.every((origin) => granted.has(origin)),
      ),
      remove: vi.fn(async ({ origins }: { origins: string[] }) => {
        origins.forEach((origin) => granted.delete(origin));
        return true;
      }),
    },
    tabs: { create: vi.fn(async (options: { url: string }) => options) },
  };
  runInNewContext(workerCode, {
    chrome,
    fetch,
    crypto: webcrypto,
    URL,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    Response,
    Headers,
    Blob,
    structuredClone,
    setTimeout,
    clearTimeout,
    __testTranslate: translate,
    __testDiscoverModels: discoverModels,
  });
  return {
    store,
    chrome,
    fetch,
    translate,
    discoverModels,
    granted,
    send: (message: unknown, sender: Sender = pageSender) =>
      new Promise<ExtensionResponse>((resolve) => {
        if (!handler) throw new Error("Missing worker message handler");
        handler(message, sender, resolve);
      }),
  };
}
type Worker = ReturnType<typeof createWorker>;
function success<T>(response: ExtensionResponse): T {
  expect(response).toMatchObject({ ok: true });
  if (!response.ok) throw new Error(response.error);
  return response.data as T;
}
async function completed(
  worker: Worker,
  id: string,
  sender: Sender = pageSender,
) {
  let job: Job | undefined;
  await vi.waitFor(
    async () => {
      job = success<Job>(await worker.send({ type: "ww:job:get", id }, sender));
      expect(job.status).toBe("succeeded");
    },
    { timeout: 2000, interval: 10 },
  );
  return job!;
}
async function startAndComplete(
  worker: Worker,
  message = startMessage,
  sender: Sender = pageSender,
) {
  const job = success<Job>(await worker.send(message, sender));
  return completed(worker, job.id, sender);
}
async function library(worker: Worker) {
  return success<Library>(
    await worker.send({ type: "ww:library:get" }, librarySender),
  );
}
function otherPage(url = "https://developer.example/another-article") {
  return { ...pageSender, url, tab: { ...pageSender.tab, url } };
}

beforeAll(async () => {
  const result = await build({
    entryPoints: ["extension/src/background.ts"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "chrome116",
    plugins: [
      {
        name: "controlled-translation",
        setup(plugin) {
          plugin.onResolve({ filter: /\/translation(?:\.ts)?$/ }, () => ({
            path: "translation-fixture",
            namespace: "worker-test",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "worker-test" }, () => ({
            loader: "js",
            contents: `
        export const translateArticle = (...args) => globalThis.__testTranslate(...args);
        export const discoverModels = (...args) => globalThis.__testDiscoverModels(...args);
      `,
          }));
        },
      },
    ],
  });
  workerCode = result.outputFiles[0].text;
});

describe("local worker transport and authorization", () => {
  it("defaults fresh and legacy configurations to free without contacting the website", async () => {
    for (const store of [
      {},
      {
        [configKey]: {
          serverUrl: legacyServer,
          accessToken: legacyToken,
          retention: "medium",
          glossMode: "first",
        },
      },
    ]) {
      const worker = createWorker({ store });
      expect(
        success<Record<string, unknown>>(
          await worker.send({ type: "ww:config:get" }, uiSender),
        ).translationMode,
      ).toBe("free");
      expect(await worker.send({ type: "ww:status" }, uiSender)).toMatchObject({
        ok: true,
      });
      expect(worker.translate).not.toHaveBeenCalled();
      await startAndComplete(worker);
      expect(worker.translate).toHaveBeenCalledWith(
        expect.objectContaining({ sourceUrl: pageSender.url }),
        expect.objectContaining({ mode: "free" }),
      );
      expect(worker.fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(worker.store[libraryKey])).not.toContain(
        legacyToken,
      );
    }
  });

  it("allows secrets/library only in trusted UI and gives pages secret-free preferences", async () => {
    const worker = createWorker({ store: { [configKey]: aiConfig } });
    for (const type of [
      "ww:config:get",
      "ww:config:set",
      "ww:status",
      "ww:models:list",
      "ww:cache:clear",
      "ww:library:get",
      "ww:library:delete",
    ])
      expect(
        await worker.send({ type, config: freeConfig, id: "local_example" }),
      ).toMatchObject({ ok: false, status: 403 });
    const preferences = success<Record<string, unknown>>(
      await worker.send({ type: "ww:preferences:get" }),
    );
    expect(preferences).toMatchObject({
      retention: "medium",
      glossMode: "first",
    });
    expect(JSON.stringify(preferences)).not.toMatch(
      /aiApiKey|accessToken|personal-ai-key|old-server-token/,
    );
    expect(
      await worker.send({ type: "ww:config:get" }, librarySender),
    ).toMatchObject({ ok: true, data: { aiApiKey: apiKey } });
    expect(
      await worker.send({ type: "ww:library:get" }, librarySender),
    ).toMatchObject({ ok: true });
    expect(worker.chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    expect(
      worker.chrome.storage.local.setAccessLevel.mock.invocationCallOrder[0],
    ).toBeLessThan(worker.chrome.storage.local.get.mock.invocationCallOrder[0]);
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("requires AI permission and valid settings, and rejects stale free-mode consent", async () => {
    const worker = createWorker();
    expect(
      await worker.send({ type: "ww:config:set", config: aiConfig }, uiSender),
    ).toMatchObject({ ok: false });
    worker.granted.add("https://api.deepseek.com/*");
    for (const config of [
      { ...aiConfig, aiApiKey: "" },
      { ...aiConfig, aiBaseUrl: "http://public.example/v1" },
      { ...aiConfig, aiBaseUrl: "https://user:password@api.deepseek.com/v1" },
      { ...aiConfig, aiBaseUrl: "https://api.deepseek.com/v1?token=unsafe" },
    ])
      expect(
        await worker.send({ type: "ww:config:set", config }, uiSender),
      ).toMatchObject({ ok: false });
    expect(
      await worker.send({ type: "ww:config:set", config: aiConfig }, uiSender),
    ).toMatchObject({ ok: true });
    expect(await worker.send({ type: "ww:status" }, uiSender)).toMatchObject({
      ok: true,
    });
    expect(await worker.send(startMessage)).toMatchObject({ ok: false });
    expect(worker.translate).not.toHaveBeenCalled();
    expect(await worker.send({ type: "ww:models:list" })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(
      await worker.send({ type: "ww:models:list" }, uiSender),
    ).toMatchObject({ ok: true });
    expect(worker.discoverModels).toHaveBeenCalledWith({
      baseUrl: aiConfig.aiBaseUrl,
      apiKey,
    });
    await startAndComplete(worker, { ...startMessage, translationMode: "ai" });
    expect(worker.translate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        mode: "ai",
        ai: { baseUrl: aiConfig.aiBaseUrl, apiKey, model: aiConfig.aiModel },
      }),
    );
    expect(JSON.stringify(worker.store[libraryKey])).not.toContain(apiKey);
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("rejects foreign senders/subframes and limits record access to the originating page", async () => {
    const worker = createWorker();
    for (const sender of [
      { ...pageSender, id: "foreign-extension" },
      { ...pageSender, frameId: 1 },
      uiSender,
    ])
      expect(await worker.send(startMessage, sender)).toMatchObject({
        ok: false,
        status: 403,
      });
    for (const sourceUrl of [
      "https://unrelated.example/article",
      "https://developer.example/another-article",
    ])
      expect(
        await worker.send({
          ...startMessage,
          input: { ...startMessage.input, sourceUrl },
        }),
      ).toMatchObject({ ok: false });
    expect(
      await worker.send({
        type: "ww:fetch",
        url: "https://attacker.example/steal",
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await worker.send({ type: "ww:job:get", id: "../../config" }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(worker.translate).not.toHaveBeenCalled();
    const job = await startAndComplete(worker);
    const wordId = job.article!.version!.occurrences[0].vocabularyId;
    for (const message of [
      { type: "ww:job:get", id: job.id },
      { type: "ww:job:retry", id: job.id },
      { type: "ww:word:update", id: wordId, patch: { favorite: true } },
    ])
      expect(await worker.send(message, otherPage())).toMatchObject({
        ok: false,
        status: 403,
      });
    expect(
      await worker.send({ type: "ww:reader:open", id: job.id }),
    ).toMatchObject({ ok: true });
    expect(worker.chrome.tabs.create).toHaveBeenCalledWith({
      url: `chrome-extension://${extensionId}/library.html?article=${job.id}`,
    });
    expect(worker.fetch).not.toHaveBeenCalled();
  });
});

describe("local worker durable jobs and vocabulary", () => {
  it("responds immediately, coalesces concurrent starts and reuses completed work after restart", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const worker = createWorker({
      translate: async (input, context) => {
        await pending;
        return fixtureArticle(input, context);
      },
    });
    const [first, second] = await Promise.all([
      worker.send(startMessage),
      worker.send(startMessage),
    ]);
    const job = success<Job>(first);
    expect(job.status).toBe("running");
    expect(success<Job>(second)).toMatchObject({
      id: job.id,
      status: "running",
    });
    await vi.waitFor(() => expect(worker.translate).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(worker.store[libraryKey])).toContain(job.id);
    finish();
    await completed(worker, job.id);
    expect(success<Job>(await worker.send(startMessage))).toMatchObject({
      id: job.id,
      status: "succeeded",
    });
    const restarted = createWorker({ store: worker.store });
    expect(success<Job>(await restarted.send(startMessage))).toMatchObject({
      id: job.id,
      status: "succeeded",
    });
    expect(restarted.translate).not.toHaveBeenCalled();
  });

  it("fails interrupted jobs after restart and requires an explicit retry before translating", async () => {
    const interrupted = createWorker({
      translate: async () => new Promise<ArticleDetail>(() => undefined),
    });
    const job = success<Job>(await interrupted.send(startMessage));
    const restarted = createWorker({ store: interrupted.store });
    expect(await restarted.send({ type: "ww:status" }, uiSender)).toMatchObject(
      { ok: true },
    );
    expect(
      success<Job>(await restarted.send({ type: "ww:job:get", id: job.id }))
        .status,
    ).toBe("failed");
    expect(success<Job>(await restarted.send(startMessage))).toMatchObject({
      id: job.id,
      status: "failed",
    });
    expect(restarted.translate).not.toHaveBeenCalled();
    expect(
      success<Job>(await restarted.send({ type: "ww:job:retry", id: job.id }))
        .status,
    ).toBe("running");
    await completed(restarted, job.id);
    expect(restarted.translate).toHaveBeenCalledTimes(1);
    expect(restarted.fetch).not.toHaveBeenCalled();
  });

  it("never automatically retries provider failures on polling or repeated start", async () => {
    let fail = true;
    const worker = createWorker({
      translate: async (input, context) => {
        if (fail) throw new Error("模拟翻译服务暂时不可用");
        return fixtureArticle(input, context);
      },
    });
    const job = success<Job>(await worker.send(startMessage));
    await vi.waitFor(async () =>
      expect(
        success<Job>(await worker.send({ type: "ww:job:get", id: job.id }))
          .status,
      ).toBe("failed"),
    );
    expect(success<Job>(await worker.send(startMessage))).toMatchObject({
      id: job.id,
      status: "failed",
    });
    expect(worker.translate).toHaveBeenCalledTimes(1);
    fail = false;
    expect(
      await worker.send({ type: "ww:job:retry", id: job.id }),
    ).toMatchObject({ ok: true });
    await completed(worker, job.id);
    expect(worker.translate).toHaveBeenCalledTimes(2);
  });

  it("isolates mode/provider/model/key/retention caches and rejects retry with changed provider settings", async () => {
    const worker = createWorker({
      granted: ["https://api.deepseek.com/*", "https://other-api.example/*"],
    });
    const ids = [(await startAndComplete(worker)).id];
    for (const config of [
      aiConfig,
      { ...aiConfig, aiModel: "fixture-model-b" },
      { ...aiConfig, aiApiKey: "different-personal-key" },
      { ...aiConfig, aiBaseUrl: "https://other-api.example/v1" },
    ]) {
      expect(
        await worker.send({ type: "ww:config:set", config }, uiSender),
      ).toMatchObject({ ok: true });
      ids.push(
        (
          await startAndComplete(worker, {
            ...startMessage,
            translationMode: "ai",
          })
        ).id,
      );
    }
    ids.push(
      (
        await startAndComplete(worker, {
          ...startMessage,
          translationMode: "ai",
          retention: "high",
        })
      ).id,
    );
    expect(new Set(ids).size).toBe(6);
    expect(worker.translate).toHaveBeenCalledTimes(6);
    expect(
      await worker.send({ type: "ww:job:retry", id: ids[0] }),
    ).toMatchObject({ ok: false });
    expect(worker.translate).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(worker.store[libraryKey])).not.toMatch(
      /personal-ai-key-test-fixture|different-personal-key|old-server-token/,
    );
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("persists local vocabulary and retains explicit favorites after deleting articles and clearing cache", async () => {
    const worker = createWorker();
    const job = await startAndComplete(worker);
    const wordId = job.article!.version!.occurrences[0].vocabularyId;
    expect(
      success<UserWord>(
        await worker.send({
          type: "ww:word:update",
          id: wordId,
          patch: { favorite: true, status: "LEARNING" },
        }),
      ),
    ).toMatchObject({ favorite: true, status: "LEARNING" });
    expect(
      (await library(worker)).words.find((word) => word.id === wordId)?.user,
    ).toMatchObject({ favorite: true, status: "LEARNING" });
    const restarted = createWorker({ store: worker.store });
    expect(
      success<Job>(await restarted.send({ type: "ww:job:get", id: job.id }))
        .article!.version!.occurrences[0].word.user,
    ).toMatchObject({ favorite: true });
    expect(
      await restarted.send(
        { type: "ww:library:delete", id: job.id },
        librarySender,
      ),
    ).toMatchObject({ ok: true });
    expect((await library(restarted)).articles).toHaveLength(0);
    expect(
      (await library(restarted)).words.find((word) => word.id === wordId)?.user
        ?.favorite,
    ).toBe(true);
    expect(
      await restarted.send({ type: "ww:cache:clear" }, uiSender),
    ).toMatchObject({ ok: true });
    expect(
      (await library(restarted)).words.find((word) => word.id === wordId)?.user
        ?.favorite,
    ).toBe(true);
    expect(restarted.fetch).not.toHaveBeenCalled();
  });

  it("preserves existing data when storage rejects writes or article/byte limits are reached", async () => {
    let rejectStorage = false;
    const worker = createWorker({ failStorage: () => rejectStorage });
    const first = await startAndComplete(worker);
    const wordId = first.article!.version!.occurrences[0].vocabularyId;
    expect(
      await worker.send({
        type: "ww:word:update",
        id: wordId,
        patch: { favorite: true },
      }),
    ).toMatchObject({ ok: true });
    const before = structuredClone(worker.store[libraryKey]);
    rejectStorage = true;
    const different = {
      ...startMessage,
      input: {
        ...startMessage.input,
        blocks: [{ id: "b0", markdown: "A different paragraph about state." }],
      },
    };
    expect(await worker.send(different)).toMatchObject({ ok: false });
    expect(worker.store[libraryKey]).toEqual(before);
    expect(worker.translate).toHaveBeenCalledTimes(1);
    rejectStorage = false;
    for (let index = 1; index < 20; index++)
      await startAndComplete(worker, {
        ...startMessage,
        input: {
          ...startMessage.input,
          blocks: [{ id: "b0", markdown: `State update paragraph ${index}.` }],
        },
      });
    const full = structuredClone(worker.store[libraryKey]);
    expect(await worker.send(different)).toMatchObject({
      ok: false,
      status: 429,
    });
    expect(worker.store[libraryKey]).toEqual(full);
    expect(
      (await library(worker)).words.find((word) => word.id === wordId)?.user
        ?.favorite,
    ).toBe(true);
    expect(worker.translate).toHaveBeenCalledTimes(20);

    let oversized = false;
    const byteLimited = createWorker({
      translate: async (input, context) => {
        const article = fixtureArticle(input, context);
        if (oversized) article.sourceText = "x".repeat(5 * 1024 * 1024);
        return article;
      },
    });
    const saved = await startAndComplete(byteLimited);
    const savedWord = saved.article!.version!.occurrences[0].vocabularyId;
    success(
      await byteLimited.send({
        type: "ww:word:update",
        id: savedWord,
        patch: { favorite: true },
      }),
    );
    const savedArticle = (await library(byteLimited)).articles[0];
    oversized = true;
    const tooLarge = success<Job>(await byteLimited.send(different));
    await vi.waitFor(async () => {
      const failed = success<Job>(
        await byteLimited.send({ type: "ww:job:get", id: tooLarge.id }),
      );
      expect(failed).toMatchObject({ status: "failed" });
      expect(failed.error).toContain("5 MiB");
    });
    const afterOversize = await library(byteLimited);
    expect(afterOversize.articles).toEqual([savedArticle]);
    expect(afterOversize.words).toHaveLength(1);
    expect(afterOversize.words[0].user?.favorite).toBe(true);
    expect(
      new TextEncoder().encode(JSON.stringify(byteLimited.store[libraryKey]))
        .byteLength,
    ).toBeLessThan(5 * 1024 * 1024);
  });
});
