import { build } from "esbuild";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtensionResponse } from "../extension/src/protocol";

let workerCode = "";
const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const serverUrl = "https://learning.example";
const accessToken = "extension-test-token-with-at-least-32-characters";
const defaultConfig = { serverUrl, accessToken, retention: "medium", glossMode: "first" };
const pageSender = { id: extensionId, url: "https://developer.example/react", frameId: 0, tab: { id: 7, url: "https://developer.example/react" } };
const uiSender = { id: extensionId, url: `chrome-extension://${extensionId}/options.html` };
const startMessage = {
  type: "ww:job:start",
  retention: "medium",
  input: { title: "React state", sourceUrl: pageSender.url, blocks: [{ id: "b0", markdown: "React batches state updates." }] },
};
type Store = Record<string, unknown>;
type Sender = typeof uiSender | typeof pageSender;
type Handler = (message: unknown, sender: Sender, respond: (result: ExtensionResponse) => void) => boolean;
type FetchHandler = (url: string, options: RequestInit) => Promise<Response>;

function createWorker(options: { store?: Store; fetch?: FetchHandler; granted?: string[] } = {}) {
  const store = options.store ?? { "wordweave.config": { ...defaultConfig } };
  const granted = new Set(options.granted ?? [`${serverUrl}/*`]);
  let handler: Handler | undefined;
  const fetch = vi.fn(options.fetch ?? (async () => Response.json({ id: "article1", status: "running" })));
  const setAccessLevel = vi.fn(async () => undefined);
  const get = vi.fn(async (key: string) => structuredClone({ [key]: store[key] }));
  const chrome = {
    runtime: {
      id: extensionId,
      getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
      onMessage: { addListener: (listener: Handler) => { handler = listener; } },
      onInstalled: { addListener: () => undefined },
      openOptionsPage: vi.fn(),
    },
    storage: { local: {
      setAccessLevel, get,
      set: async (value: Store) => { Object.assign(store, structuredClone(value)); },
      remove: async (key: string) => { delete store[key]; },
    } },
    permissions: {
      contains: vi.fn(async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.has(origin))),
      remove: vi.fn(async ({ origins }: { origins: string[] }) => { origins.forEach((origin) => granted.delete(origin)); return true; }),
    },
    tabs: { create: vi.fn(async () => undefined) },
  };
  runInNewContext(workerCode, { chrome, fetch, crypto: webcrypto, URL, TextEncoder, AbortController, setTimeout, clearTimeout });
  return {
    store, fetch, chrome,
    send: (message: unknown, sender: Sender = pageSender) => new Promise<ExtensionResponse>((resolve) => {
      if (!handler) throw new Error("Worker did not install a message handler");
      handler(message, sender, resolve);
    }),
  };
}
function body(call: [url: string, options: RequestInit]) {
  return JSON.parse(String(call[1].body)) as { requestKey: string; blocks: unknown };
}

beforeAll(async () => {
  const result = await build({ entryPoints: ["extension/src/background.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "chrome116" });
  workerCode = result.outputFiles[0].text;
});

describe("extension worker trust and credential boundaries", () => {
  it("restricts credential access to extension UI and keeps webpage preferences secret-free", async () => {
    const worker = createWorker();
    expect(await worker.send({ type: "ww:config:get" })).toMatchObject({ ok: false, status: 403 });
    expect(await worker.send({ type: "ww:config:set", config: defaultConfig })).toMatchObject({ ok: false, status: 403 });
    expect(await worker.send({ type: "ww:status" })).toMatchObject({ ok: false, status: 403 });
    expect(await worker.send({ type: "ww:preferences:get" })).toEqual({ ok: true, data: { retention: "medium", glossMode: "first" } });
    expect(await worker.send({ type: "ww:config:get" }, uiSender)).toMatchObject({ ok: true, data: defaultConfig });
    expect(worker.chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(worker.chrome.storage.local.setAccessLevel.mock.invocationCallOrder[0]).toBeLessThan(worker.chrome.storage.local.get.mock.invocationCallOrder[0]);
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("rejects foreign senders, subframes, mismatched sources and arbitrary endpoint messages", async () => {
    const worker = createWorker();
    expect(await worker.send(startMessage, { ...pageSender, id: "another-extension" })).toMatchObject({ ok: false, status: 403 });
    expect(await worker.send(startMessage, { ...pageSender, frameId: 1 })).toMatchObject({ ok: false, status: 403 });
    expect(await worker.send(startMessage, uiSender)).toMatchObject({ ok: false, status: 403 });
    expect(await worker.send({ ...startMessage, input: { ...startMessage.input, sourceUrl: "https://unrelated.example/article" } })).toMatchObject({ ok: false, status: 400 });
    expect(await worker.send({ type: "ww:fetch", url: "https://unrelated.example/steal-token" })).toMatchObject({ ok: false, status: 400 });
    expect(await worker.send({ type: "ww:job:get", id: "../../config" })).toMatchObject({ ok: false, status: 400 });
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("does not send a request until both a token and the exact server permission are configured", async () => {
    const empty = createWorker({ store: {} });
    expect(await empty.send(startMessage)).toMatchObject({ ok: false });
    expect(empty.fetch).not.toHaveBeenCalled();
    const ungranted = createWorker({ granted: ["https://other.example/*"] });
    expect(await ungranted.send(startMessage)).toMatchObject({ ok: false });
    expect(ungranted.fetch).not.toHaveBeenCalled();
  });

  it("sends bearer authentication only to a fixed endpoint and forbids redirects or website cookies", async () => {
    const worker = createWorker({ fetch: async () => Response.json({ ok: true, modelConfigured: true }) });
    expect(await worker.send({ type: "ww:status" }, uiSender)).toEqual({ ok: true, data: { ok: true, modelConfigured: true } });
    expect(worker.fetch).toHaveBeenCalledWith(`${serverUrl}/api/extension/status`, expect.objectContaining({
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` },
    }));
    for (const server of ["http://public.example", "https://learning.example/path", "https://user:pass@learning.example"]) {
      expect(await worker.send({ type: "ww:config:set", config: { ...defaultConfig, serverUrl: server } }, uiSender)).toMatchObject({ ok: false });
    }
    expect(worker.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses a valid host permission pattern while preserving the configured localhost API port", async () => {
    const localConfig = { ...defaultConfig, serverUrl: "http://127.0.0.1:3000" };
    const worker = createWorker({ store: { "wordweave.config": localConfig }, granted: ["http://127.0.0.1/*"], fetch: async () => Response.json({ ok: true, modelConfigured: true }) });
    expect(await worker.send({ type: "ww:status" }, uiSender)).toMatchObject({ ok: true });
    expect(worker.chrome.permissions.contains).toHaveBeenCalledWith({ origins: ["http://127.0.0.1/*"] });
    expect(worker.fetch.mock.calls[0][0]).toBe("http://127.0.0.1:3000/api/extension/status");
    expect(await worker.send({ type: "ww:config:set", config: { ...localConfig, serverUrl: "http://127.0.0.1:3001" } }, uiSender)).toMatchObject({ ok: true });
    expect(worker.chrome.permissions.remove).not.toHaveBeenCalled();
  });
});

describe("extension worker generation idempotency", () => {
  it("coalesces concurrent submissions and reuses the saved article across worker restarts", async () => {
    const worker = createWorker();
    const responses = await Promise.all([worker.send(startMessage), worker.send(startMessage)]);
    expect(responses).toEqual([{ ok: true, data: { id: "article1", status: "running" } }, { ok: true, data: { id: "article1", status: "running" } }]);
    expect(worker.fetch.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
    expect(body(worker.fetch.mock.calls[0]).requestKey).toMatch(/^[0-9a-f-]{36}$/);
    const saved = JSON.stringify(worker.store["wordweave.jobs"]);
    expect(saved).not.toContain(accessToken);
    expect(saved).not.toContain("React batches");

    const restarted = createWorker({ store: worker.store, fetch: async () => Response.json({ id: "article1", status: "succeeded", article: { id: "article1" } }) });
    expect(await restarted.send(startMessage)).toEqual({ ok: true, data: { id: "article1", status: "succeeded" } });
    expect(restarted.fetch).toHaveBeenCalledTimes(1);
    expect(restarted.fetch.mock.calls[0][1].method).toBe("GET");
  });

  it("persists the request key before POST so interrupted submissions retry safely after restart", async () => {
    const store: Store = { "wordweave.config": { ...defaultConfig } };
    let requestKey = "";
    const worker = createWorker({ store, fetch: async (_url, options) => {
      requestKey = JSON.parse(String(options.body)).requestKey;
      expect(JSON.stringify(store["wordweave.jobs"])).toContain(requestKey);
      throw new TypeError("network connection lost after sending request");
    } });
    expect(await worker.send(startMessage)).toMatchObject({ ok: false });
    const restarted = createWorker({ store });
    expect(await restarted.send(startMessage)).toMatchObject({ ok: true });
    expect(body(restarted.fetch.mock.calls[0]).requestKey).toBe(requestKey);
  });

  it("does not reuse cached tasks across different tokens or retention levels", async () => {
    const worker = createWorker();
    await worker.send(startMessage);
    const firstKey = body(worker.fetch.mock.calls[0]).requestKey;
    expect(await worker.send({ type: "ww:config:set", config: { ...defaultConfig, accessToken: `${accessToken}-rotated` } }, uiSender)).toMatchObject({ ok: true });
    await worker.send(startMessage);
    await worker.send({ ...startMessage, retention: "high" });
    expect(worker.fetch).toHaveBeenCalledTimes(3);
    const keys = worker.fetch.mock.calls.map((call) => body(call).requestKey);
    expect(new Set(keys).size).toBe(3);
    expect(keys[1]).not.toBe(firstKey);
    expect(worker.fetch.mock.calls.every((call) => call[1].method === "POST")).toBe(true);
  });

  it("returns failed cached jobs without silently paying for an automatic retry", async () => {
    const worker = createWorker({ fetch: async (_url, options) => Response.json({ id: "article1", status: options.method === "POST" ? "running" : "failed", error: "model unavailable" }) });
    await worker.send(startMessage);
    expect(await worker.send(startMessage)).toEqual({ ok: true, data: { id: "article1", status: "failed" } });
    expect(worker.fetch.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
  });
});
