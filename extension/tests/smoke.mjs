/**
 * Local-only integration harness: distributed background bundle in a Node VM
 * with explicit Chrome API/storage mocks, real content bundle in Chromium.
 * Provider traffic goes only to owned localhost fixtures. No website/database.
 * Managed Chromium disallows unpacked extensions; no policy is bypassed.
 * This does NOT validate MV3 installation, lifecycle or native permission UI.
 */
import assert from "node:assert/strict";
import { randomBytes, webcrypto } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { chromium, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const results = path.join(root, "test-results/extension");
const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const extensionUrl = `chrome-extension://${extensionId}/`;
const secret = `fixture-only-${randomBytes(24).toString("hex")}`;
const sentence = "React batches state updates to avoid unnecessary re-renders.";
const expression = "avoid unnecessary re-renders";
const mode = "local-worker-content-harness";
const checks = [], providerRequests = [], pageMessages = [], accessLevels = [], unexpectedRequests = [], mockErrors = [], workers = [];
let store = {};
let worker, browser, context, providerServer, fixtureServer, temporary;
let providerUrl, fixtureUrl, backgroundCode, storageFile;
let googleMode = "valid", aiMode = "valid";
let googleRequests = 0, aiRequests = 0, modelsRequests = 0;
const uiSender = { id: extensionId, url: `${extensionUrl}options.html` };
const pageSender = (url) => ({ id: extensionId, url, frameId: 0, tab: { id: 7, url } });
const clean = (value) => String(value).replaceAll(secret, "[fixture-key]").split("\n").filter((line) => line.length < 2000).join("\n");
function report(message) { checks.push(message); console.log(`✓ ${message}`); }
async function listen(server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function until(action, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await action(); if (result) return result; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
function noPrivateInput(value) {
  for (const excluded of ["Never send or rewrite this code block", "Hidden secret fixture", "Private form content", "setCount((n) => n + 1)"])
    assert.ok(!value.includes(excluded), `Protected/excluded text reached provider: ${excluded}`);
}
function googleTranslation(source) {
  const plain = source.replace(/\\([.\-])/g, "$1");
  const dictionary = new Map([
    [sentence, "React 批量处理状态更新，以避免不必要的重新渲染。"],
    [expression, "避免不必要的重新渲染"], ["state updates", "状态更新"],
    ["batches state updates", "批量处理状态更新"], ["unnecessary re-renders", "不必要的重新渲染"],
    ["React state updates", "React 状态更新"],
  ]);
  if (dictionary.has(plain.trim())) return dictionary.get(plain.trim());
  if (plain.includes(sentence)) return plain.replace(sentence, dictionary.get(sentence));
  return `测试译文：${source}`; // Preserve all protection markers verbatim.
}
function aiGeneration(paragraphs) {
  const plain = (value) => value.replace(/\\([.\-])/g, "$1");
  const used = paragraphs.some((paragraph) => plain(paragraph.source).includes(sentence));
  return {
    title: "本地 AI 测试夹具",
    terms: used ? [{
      id: "expression", lemma: expression, partOfSpeech: "phrase", meaning: "避免不必要的重新渲染",
      grammar: { article: "", plural: "", infinitive: "", currentForm: "", note: "avoid 后接名词或动名词。" },
      explanation: "测试夹具表达说明。", example: sentence,
      exampleTranslation: "React 批量处理状态更新，以避免不必要的重新渲染。", category: "general",
    }] : [],
    paragraphs: paragraphs.map((paragraph) => ({
      id: paragraph.id,
      segments: plain(paragraph.source).includes(sentence) ? [
        { type: "text", text: "React 会批量处理状态更新，以 " },
        { type: "term", text: expression, termId: "expression", meaning: "避免不必要的重新渲染", sentence },
        { type: "text", text: "。" + plain(paragraph.source).replace(sentence, "") },
      ] : [{ type: "text", text: /^#{1,6}\s/.test(paragraph.source) ? paragraph.source : `测试解释：${paragraph.source}` }],
    })),
  };
}
async function providerFetch(input, init = {}) {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  const headers = new Headers(init.headers);
  providerRequests.push({ origin: url.origin, pathname: url.pathname, hasAuthorization: headers.has("authorization") });
  assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error");
  let target;
  if (url.origin === "https://translate.googleapis.com" && url.pathname === "/translate_a/single") {
    assert.equal(headers.has("authorization"), false, "Personal key must never be sent to Google");
    target = `${providerUrl}/google${url.search}`;
  } else if (url.origin === providerUrl && ["/v1/chat/completions", "/v1/models"].includes(url.pathname)) {
    assert.equal(headers.get("authorization"), `Bearer ${secret}`); target = url.href;
  } else {
    unexpectedRequests.push(`${url.origin}${url.pathname}`);
    throw new Error("Unexpected external/website request blocked by test transport");
  }
  return fetch(target, init);
}
async function saveStore(values) {
  Object.assign(store, structuredClone(values));
  await writeFile(storageFile, JSON.stringify(store), { mode: 0o600 });
}
function createWorker() {
  let listener, accessLevelSet = false;
  const timers = new Set();
  const instance = {
    send(message, sender = uiSender) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Worker message timed out: ${message.type}`)), 12000);
        try {
          assert.ok(listener, "Background did not register a message listener");
          listener(structuredClone(message), structuredClone(sender), (value) => { clearTimeout(timeout); resolve(structuredClone(value)); });
        } catch (error) { clearTimeout(timeout); reject(error); }
      });
    },
    close() { for (const timer of timers) clearTimeout(timer); timers.clear(); },
  };
  const chrome = {
    runtime: {
      id: extensionId, getURL: (name) => `${extensionUrl}${name}`,
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: { addListener() {} }, onStartup: { addListener() {} }, openOptionsPage: async () => {},
    },
    storage: { local: {
      async setAccessLevel(value) { assert.equal(value.accessLevel, "TRUSTED_CONTEXTS"); accessLevelSet = true; accessLevels.push(value.accessLevel); },
      async get(keys) {
        assert.ok(accessLevelSet, "Storage must be restricted before any read");
        if (keys == null) return structuredClone(store);
        if (typeof keys === "string") return structuredClone({ [keys]: store[keys] });
        if (Array.isArray(keys)) return structuredClone(Object.fromEntries(keys.map((key) => [key, store[key]])));
        return structuredClone({ ...keys, ...Object.fromEntries(Object.keys(keys).filter((key) => key in store).map((key) => [key, store[key]])) });
      },
      set: saveStore,
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key]; await saveStore({}); },
      async getBytesInUse() { return Buffer.byteLength(JSON.stringify(store)); },
    } },
    permissions: {
      contains: async ({ origins }) => origins.every((origin) => ["https://translate.googleapis.com/*", "http://127.0.0.1/*"].includes(origin)),
      remove: async () => true,
    },
    tabs: { create: async () => ({ id: 8 }) },
  };
  runInNewContext(backgroundCode, {
    chrome, fetch: providerFetch, crypto: webcrypto, URL, URLSearchParams, TextEncoder, TextDecoder,
    AbortController, AbortSignal, Response, Request, Headers, DOMException, structuredClone, console,
    setTimeout(fn, ms, ...args) { const timer = setTimeout(() => { timers.delete(timer); fn(...args); }, ms); timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
  }, { filename: "distributed-background.js" });
  workers.push(instance); return instance;
}
async function sendData(message, sender = uiSender) {
  const response = await worker.send(message, sender);
  assert.equal(response.ok, true, `Worker rejected ${message.type}: ${clean(response.error)}`);
  return response.data;
}
async function jobDone(id, sender) {
  return until(async () => {
    const value = await sendData({ type: "ww:job:get", id }, sender);
    return ["succeeded", "failed"].includes(value.status) ? value : null;
  }, `job ${id} terminal state`);
}

try {
  await mkdir(results, { recursive: true });
  temporary = await mkdtemp(path.join(tmpdir(), "wordweave-local-extension-smoke-"));
  storageFile = path.join(temporary, "mock-chrome-storage.json");
  backgroundCode = await readFile(path.join(root, "extension/dist/background.js"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(root, "extension/dist/manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  console.log(`MODE: ${mode}. Chrome runtime/storage APIs are mocks; distributed background/content code runs. Provider HTTP fixtures are local. MV3 installation and native permissions are NOT tested.`);
  providerServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://fixture.invalid");
      response.setHeader("Content-Type", "application/json");
      if (url.pathname === "/google") {
        googleRequests++; assert.equal(request.method, "GET");
        assert.equal(url.searchParams.get("sl"), "en"); assert.equal(url.searchParams.get("tl"), "zh-CN");
        const source = url.searchParams.get("q"); assert.ok(source); noPrivateInput(source);
        const selected = googleMode; await delay(25);
        if (selected === "http-failure") return response.writeHead(503).end(JSON.stringify({ error: `intentional fixture failure ${secret}` }));
        return response.end(JSON.stringify([[[googleTranslation(source), source, null, null, 1]], null, "en"]));
      }
      if (url.pathname === "/v1/models") {
        modelsRequests++; assert.equal(request.headers.authorization, `Bearer ${secret}`);
        return response.end(JSON.stringify({ data: [{ id: "fixture-local-model", object: "model" }] }));
      }
      if (url.pathname === "/v1/chat/completions") {
        aiRequests++; assert.equal(request.method, "POST"); assert.equal(request.headers.authorization, `Bearer ${secret}`);
        let body = ""; for await (const chunk of request) body += chunk;
        const payload = JSON.parse(body); assert.equal(payload.model, "fixture-local-model"); noPrivateInput(body);
        const data = JSON.parse(payload.messages.find((message) => message.role === "user").content);
        const paragraphs = data.blocks?.map((block) => ({ id: block.id, source: block.text })) ?? data.data?.paragraphs ?? data.paragraphs;
        assert.ok(Array.isArray(paragraphs) && paragraphs.length);
        const selected = aiMode; await delay(100);
        if (selected === "http-failure") return response.writeHead(401).end(JSON.stringify({ error: { message: `Deliberate provider echo ${secret}` } }));
        return response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: selected === "invalid" ? "not valid JSON" : JSON.stringify(aiGeneration(paragraphs)) } }] }));
      }
      response.writeHead(404).end();
    } catch (error) { mockErrors.push(clean(error.stack ?? error)); response.writeHead(500).end(JSON.stringify({ error: "fixture assertion failed" })); }
  });
  providerUrl = await listen(providerServer);
  const html = await readFile(path.join(root, "extension/tests/fixtures/article.html"));
  fixtureServer = createServer((_request, response) => { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); });
  fixtureUrl = await listen(fixtureServer); worker = createWorker();
  const config = await sendData({ type: "ww:config:get" });
  assert.equal(config.translationMode, "free"); assert.equal(config.aiApiKey, "");
  const status = await sendData({ type: "ww:status" });
  assert.equal(status.localOnly, true); assert.equal(status.translationMode, "free"); assert.equal(providerRequests.length, 0);
  for (const type of ["ww:config:get", "ww:config:set", "ww:models:list", "ww:library:get"]) {
    const denied = await worker.send({ type, config }, pageSender(`${fixtureUrl}/article`));
    assert.equal(denied.ok, false); assert.equal(denied.status, 403);
  }
  const invalidSource = await worker.send({ type: "ww:job:start", retention: "medium", input: { title: "Invalid", sourceUrl: "https://different.invalid/article", blocks: [{ id: "b0", markdown: sentence }] } }, pageSender(`${fixtureUrl}/article`));
  assert.equal(invalidSource.ok, false);
  report("Empty configuration defaults to free without login/key/network probe; page senders cannot read private settings or library");
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); context.setDefaultTimeout(15000);
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === fixtureUrl) return route.continue();
    unexpectedRequests.push(route.request().url()); await route.abort();
  });
  await context.exposeBinding("__wordweaveSmokeMessage", async (source, message) => {
    pageMessages.push(structuredClone(message));
    const response = await worker.send(message, pageSender(source.page.url()));
    assert.ok(!JSON.stringify(response).includes(secret), "AI secret leaked to content response"); return response;
  });
  await context.addInitScript(({ id, base }) => {
    window.__wordweaveSmokeListeners = [];
    window.chrome = { runtime: {
      id, getURL: (value) => base + value, sendMessage: (message) => window.__wordweaveSmokeMessage(message),
      onMessage: { addListener: (listener) => window.__wordweaveSmokeListeners.push(listener) },
    } };
  }, { id: extensionId, base: extensionUrl });
  const page = await context.newPage(); await page.goto(`${fixtureUrl}/article`);
  const originalHtml = await page.locator("article").innerHTML();
  const originalCode = await page.locator("#code").textContent();
  const originalHref = await page.locator("#original-link").getAttribute("href");
  async function openController(selection = false) {
    if (!(await page.evaluate(() => window.__wordweaveContentInstalled))) await page.addScriptTag({ path: path.join(root, "extension/dist/content.js") });
    await page.evaluate((scope) => {
      for (const listener of window.__wordweaveSmokeListeners)
        listener({ type: "ww:open", scope }, { id: chrome.runtime.id, url: chrome.runtime.getURL("popup.html") }, () => {});
    }, selection ? "selection" : "article");
    await expect(page.getByRole("button", { name: /^开始(免费| AI )翻译$/ })).toBeVisible();
  }
  async function generate() {
    await page.getByRole("button", { name: /^开始(免费| AI )翻译$/ }).click();
    await expect(page.getByText("语境 · 学习版已就绪", { exact: true })).toBeVisible({ timeout: 25000 });
  }
  async function restore() {
    const collapsed = page.getByRole("button", { name: "展开", exact: true }); if (await collapsed.isVisible()) await collapsed.click();
    await page.getByRole("button", { name: "恢复网页", exact: true }).click(); await expect(page.locator("[data-wordweave-learning]")).toHaveCount(0);
  }
  await openController(); assert.equal(googleRequests, 0, "Opening panel must not send article text"); await generate();
  assert.ok(googleRequests > 0); assert.equal(aiRequests, 0);
  await expect(page.locator("#target [data-wordweave-learning]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: `查看词卡：${expression}`, exact: true })).toHaveCount(2);
  assert.equal(await page.locator("#code").textContent(), originalCode);
  await expect(page.locator("#protected code")).toHaveText("setCount((n) => n + 1)");
  await expect(page.locator("#protected a")).toHaveAttribute("href", new URL(originalHref, fixtureUrl).href);
  await expect(page.locator("#target .gloss").last()).toBeVisible();
  for (const gloss of await page.locator("#repeat .gloss").all()) await expect(gloss).toBeHidden();
  const freeLibrary = await sendData({ type: "ww:library:get" });
  assert.equal(freeLibrary.localOnly, true); assert.equal(freeLibrary.articles.length, 1);
  noPrivateInput(freeLibrary.articles[0].sourceText.replaceAll("setCount((n) => n + 1)", "[expected-protected-source]"));
  report("Real content/worker flow translates in place using only mocked Google; code/link protection and first-occurrence glosses survive");
  const term = page.getByRole("button", { name: `查看词卡：${expression}`, exact: true }); await term.first().click();
  const card = page.getByRole("dialog", { name: `词卡：${expression}`, exact: true }); await expect(card).toContainText(sentence);
  await card.getByRole("button", { name: "♡ 收藏", exact: true }).click(); await expect(card.getByRole("button", { name: "♥ 已收藏", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "想学", exact: true }).click();
  await page.screenshot({ path: path.join(results, "desktop-word-card.png"), fullPage: true }); await card.getByRole("button", { name: "关闭词卡" }).click();
  const favorite = (await sendData({ type: "ww:library:get" })).words.find((word) => word.lemma === expression);
  assert.equal(favorite.user.favorite, true); assert.equal(favorite.user.status, "LEARNING");
  await page.getByRole("button", { name: "切换本段原文与学习版" }).first().click(); await expect(page.locator("h1")).toContainText("React state updates"); await restore();
  assert.equal((await page.locator("article").innerHTML()).replaceAll(' style=""', ""), originalHtml.replaceAll(' style=""', ""));
  assert.equal(await page.evaluate(() => window.originalLink === document.querySelector("#original-link") && window.originalEventNode === document.querySelector("#event-target")), true);
  await page.locator("#event-target").click(); await expect(page.locator("body")).toHaveAttribute("data-original-clicks", "1");
  await page.locator("#original-link").click(); await expect(page.locator("body")).toHaveAttribute("data-link-clicked", "yes");
  report("Vocabulary saves explicit favorites/learning state locally; restore retains original DOM node identity and event handlers");
  const requestsBeforeCache = googleRequests;
  const input = pageMessages.find((message) => message.type === "ww:job:start");
  const duplicates = await Promise.all(Array.from({ length: 5 }, () => sendData(input, pageSender(page.url()))));
  assert.equal(new Set(duplicates.map((value) => value.id)).size, 1); assert.equal(duplicates[0].id, freeLibrary.jobs[0].id); assert.equal(googleRequests, requestsBeforeCache);
  await sendData({ type: "ww:preferences:set", glossMode: "click" }, pageSender(page.url()));
  worker.close(); store = JSON.parse(await readFile(storageFile, "utf8")); worker = createWorker();
  await page.reload(); await openController(); await generate(); assert.equal(googleRequests, requestsBeforeCache);
  assert.equal((await sendData({ type: "ww:preferences:get" }, pageSender(page.url()))).glossMode, "click");
  for (const gloss of await page.locator("#target .gloss").all()) await expect(gloss).toBeHidden();
  await term.first().click(); await expect(card.getByRole("button", { name: "♥ 已收藏", exact: true })).toBeVisible(); await card.getByRole("button", { name: "关闭词卡" }).click();
  report("Concurrent duplicates and worker/page restart reuse durable cached jobs without provider calls; favorites and reading preferences persist");
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator("#target").scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY); await term.first().click();
  const bounds = await card.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391 && bounds.height <= 844 * 0.56);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) <= 2); await page.screenshot({ path: path.join(results, "mobile-word-card.png"), fullPage: true });
  await card.getByRole("button", { name: "关闭词卡" }).click(); assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) <= 2);
  report("Mobile word card fits the viewport and preserves document scroll on open/close"); await page.setViewportSize({ width: 1280, height: 900 });
  googleMode = "http-failure"; await page.goto(`${fixtureUrl}/free-failure`);
  const freeUnchanged = await page.locator("article").innerHTML(); await openController(); await page.getByRole("button", { name: "开始免费翻译", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试免费翻译", exact: true })).toBeVisible({ timeout: 25000 }); assert.equal(await page.locator("article").innerHTML(), freeUnchanged);
  googleMode = "valid"; await page.getByRole("button", { name: "重试免费翻译", exact: true }).click(); await expect(page.getByText("语境 · 学习版已就绪", { exact: true })).toBeVisible({ timeout: 25000 }); assert.equal(aiRequests, 0);
  report("Free-provider failure preserves original DOM; explicit retry succeeds without calling AI");
  const aiConfig = { ...config, translationMode: "ai", aiBaseUrl: `${providerUrl}/v1`, aiApiKey: secret, aiModel: "fixture-local-model" };
  await sendData({ type: "ww:config:set", config: aiConfig }); await sendData({ type: "ww:models:list" }); assert.equal(modelsRequests, 1);
  assert.ok(!JSON.stringify(await sendData({ type: "ww:preferences:get" }, pageSender(page.url()))).includes(secret));
  assert.equal((await worker.send({ type: "ww:config:get" }, pageSender(page.url()))).status, 403);
  const aiGoogleBefore = googleRequests;
  for (const failure of ["http-failure", "invalid"]) {
    aiMode = failure; await page.goto(`${fixtureUrl}/ai-${failure}`); const unchanged = await page.locator("article").innerHTML(); await openController(); const before = aiRequests;
    await page.getByRole("button", { name: "开始 AI 翻译", exact: true }).click(); await expect(page.getByRole("button", { name: "重试 AI 翻译", exact: true })).toBeVisible({ timeout: 25000 });
    assert.equal(await page.locator("article").innerHTML(), unchanged); assert.ok(aiRequests > before && aiRequests - before <= 2, "Automatic retries must be bounded");
    assert.equal(googleRequests, aiGoogleBefore, "AI failure must never silently fallback to Google"); assert.ok(!(await page.locator("body").innerText()).includes(secret));
    const failedId = pageMessages.filter((message) => message.type === "ww:job:get").at(-1).id;
    const failed = await sendData({ type: "ww:job:get", id: failedId }, pageSender(page.url())); assert.equal(failed.status, "failed"); assert.ok(!JSON.stringify(failed).includes(secret));
    aiMode = "valid"; await page.getByRole("button", { name: "重试 AI 翻译", exact: true }).click(); await expect(page.getByText("语境 · 学习版已就绪", { exact: true })).toBeVisible({ timeout: 25000 });
    assert.equal((await sendData({ type: "ww:job:get", id: failedId }, pageSender(page.url()))).status, "succeeded");
  }
  assert.equal(googleRequests, aiGoogleBefore); assert.ok(!JSON.stringify(store["wordweave.local.library"]).includes(secret), "Raw key must not enter cache/library");
  report("Personal AI uses its configured endpoint; HTTP/JSON failure keeps source, redacts echoed key, never falls back to free/website, and retries explicitly");
  const detachedUrl = `${fixtureUrl}/detached`;
  const detachedInput = { type: "ww:job:start", retention: "medium", translationMode: "ai", input: { title: "Detached task", sourceUrl: detachedUrl, blocks: [{ id: "b0", markdown: sentence }] } };
  const beforeDetached = aiRequests; const submitted = await Promise.all(Array.from({ length: 4 }, () => sendData(detachedInput, pageSender(detachedUrl))));
  assert.equal(new Set(submitted.map((value) => value.id)).size, 1);
  assert.equal((await jobDone(submitted[0].id, pageSender(detachedUrl))).status, "succeeded"); assert.equal(aiRequests - beforeDetached, 1);
  await sendData({ type: "ww:config:set", config: { ...aiConfig, translationMode: "free" } }); await page.goto(`${fixtureUrl}/selection`);
  await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector("#target")); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await openController(true); await generate(); await expect(page.locator("[data-wordweave-learning]")).toHaveCount(1); await expect(page.locator("#repeat")).toHaveText(sentence);
  report("Fresh concurrent jobs coalesce to one model call and finish without UI; selection mode preserves surrounding paragraphs");
  assert.ok(!JSON.stringify(await sendData({ type: "ww:library:get" })).includes(secret)); assert.deepEqual(mockErrors, []); assert.deepEqual(unexpectedRequests, []); assert.ok(accessLevels.length >= 2);
  assert.ok(providerRequests.every((request) => request.origin === "https://translate.googleapis.com" || request.origin === providerUrl));
  const summary = {
    status: "passed", mode, checks, googleRequests, aiRequests, modelsRequests, websiteRequests: 0, databaseRequired: false, apiKeyRequired: false,
    limitations: [
      "Distributed background runs in a Node VM with mocked Chrome runtime/storage/permissions. Persistence/restart uses a temporary JSON file.",
      "Distributed content runs in ordinary Chromium through an explicit message bridge. MV3 installation/suspension, activeTab, native popup and permission dialogs are not verified.",
      "Google and AI responses come only from owned localhost HTTP fixtures; no paid requests occur. This does not measure real provider availability or translation quality.",
    ],
  };
  await writeFile(path.join(results, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`\nLocal plugin harness passed (${checks.length} checks). Results/limitations: test-results/extension/summary.json`);
} catch (error) {
  console.error(clean(error.stack ?? error)); if (mockErrors.length) console.error(mockErrors.join("\n"));
  await writeFile(path.join(results, "summary.json"), JSON.stringify({ status: "failed", mode, checks, error: clean(error.message), googleRequests, aiRequests, mockErrors, unexpectedRequests }, null, 2) + "\n").catch(() => {});
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {}); if (browser) await browser.close().catch(() => {});
  for (const item of workers) item.close();
  for (const server of [providerServer, fixtureServer]) if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
