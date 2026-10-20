/**
 * Browser UI checks using real compiled extension scripts and ExtensionSetup.
 * chrome.* is an explicit in-page test bridge. No extension is installed, no
 * administrator policy is bypassed, and no provider/backend request is sent.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const optionsOnly = process.argv.includes("--options-only");
const testFilter = process.argv.find((argument) => argument.startsWith("--match="))?.slice("--match=".length);
const temporary = await mkdtemp(join(tmpdir(), "wordweave-extension-ui-"));
const screenshots = join(repository, "test-results", "extension-ui");
const defaults = {
  translationMode: "free",
  aiBaseUrl: "https://api.deepseek.com/v1",
  aiApiKey: "",
  aiModel: "",
  serverUrl: "",
  accessToken: "",
  retention: "medium",
  glossMode: "first",
};
const originalSentence = "React batches state updates to avoid unnecessary re-renders.";
const fixtureWord = {
  id: "local-word-fixture",
  language: "en",
  lemma: "avoid unnecessary re-renders",
  partOfSpeech: "phrase",
  meaning: "避免不必要的重新渲染",
  grammar: { article: "", plural: "", infinitive: "", currentForm: "", note: "avoid 后接名词或动名词。" },
  explanation: "用 avoid unnecessary… 表达避免不必要的工作。",
  example: originalSentence,
  exampleTranslation: "React 批量处理状态更新，以避免不必要的重新渲染。",
  user: { status: "LEARNING", favorite: true, category: "general", exposureCount: 1, reviewCount: 0, knownStreak: 0, dueAt: null },
};
const fixtureArticle = {
  id: "local-article-fixture",
  title: "React 状态更新 · 插件本地测试文章",
  mode: "tech",
  language: "en",
  sourceUrl: "https://article.fixture.invalid/react",
  sourceText: originalSentence,
  sourceBlocks: [{ id: "p0001", kind: "paragraph", original: originalSentence, masked: originalSentence, protected: {} }],
  origin: "extension-free",
  generationStartedAt: null,
  generationError: null,
  createdAt: "2026-10-18T12:00:00.000Z",
  version: {
    id: "local-version-fixture",
    settings: { retention: "medium", level: "A2", minutes: "3-5", newWordCount: 5, topic: "购物", requestedWords: "", reviewOnly: false },
    coverage: { newWords: [fixtureWord.lemma], reviewWords: [], requestedNew: 1, requestedReview: 0, missing: [] },
    createdAt: "2026-10-18T12:00:00.000Z",
    paragraphs: [{ id: "paragraph-fixture", sourceId: "p0001", position: 0, original: originalSentence, segments: [
      { type: "text", text: "React 批量处理状态更新，以 " },
      { type: "term", text: fixtureWord.lemma, termId: "term-fixture", occurrenceId: "occurrence-fixture", meaning: fixtureWord.meaning, sentence: originalSentence },
      { type: "text", text: "。" },
    ] }],
    occurrences: [{ id: "occurrence-fixture", vocabularyId: fixtureWord.id, sourceId: "p0001", form: fixtureWord.lemma, meaning: fixtureWord.meaning, sentence: originalSentence, targetKind: "new", word: fixtureWord }],
  },
  progress: null,
  defaultGlossMode: "first",
};
const fixtureLibrary = {
  localOnly: true,
  articles: [fixtureArticle],
  words: [{ ...fixtureWord, appearances: [{ articleId: fixtureArticle.id, title: fixtureArticle.title, sentence: originalSentence, form: fixtureWord.lemma, sourceId: "p0001" }] }],
  jobs: [{ id: fixtureArticle.id, status: "succeeded", title: fixtureArticle.title, sourceUrl: fixtureArticle.sourceUrl, translationMode: "free" }],
};

let browser;
let server;
let passed = 0;
const contexts = new Set();

try {
  await mkdir(screenshots, { recursive: true });
  const staticDirectory = join(temporary, "static");
  await cp(join(repository, "extension/static"), staticDirectory, { recursive: true });
  await build({
    absWorkingDir: repository,
    entryPoints: (optionsOnly ? ["options", "popup"] : ["options", "popup", "library"]).map((name) => join(repository, "extension/src", `${name}.ts`)),
    outdir: staticDirectory,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome116",
  });
  await build({
    absWorkingDir: repository,
    stdin: {
      resolveDir: repository,
      loader: "tsx",
      contents: `
        import { createElement } from "react";
        import { createRoot } from "react-dom/client";
        import ExtensionPage from "./src/app/extension/page";
        createRoot(document.getElementById("fixture-root")).render(
          createElement(ExtensionPage));
      `,
    },
    outfile: join(staticDirectory, "setup.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const globalsPath = join(repository, "src/app/globals.css");
  const globals = await postcss([tailwindcss()]).process(await readFile(globalsPath, "utf8"), { from: globalsPath });
  const setupCSS = globals.css + await readFile(join(staticDirectory, "setup.css"), "utf8");
  const setupHTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Extension setup fixture</title><link rel="stylesheet" href="/setup.css"></head><body><aside style="padding:10px 18px;background:#f5e5eb;color:#714253;font-size:12px">组件浏览器测试夹具 · 未安装扩展 · 未请求模型或翻译服务</aside><div id="fixture-root"></div><script src="/setup.js"></script></body></html>`;
  const contentTypes = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    try {
      if (pathname === "/setup.html") {
        response.writeHead(200, { "Content-Type": contentTypes[".html"] }).end(setupHTML);
        return;
      }
      if (pathname === "/setup.css") {
        response.writeHead(200, { "Content-Type": contentTypes[".css"] }).end(setupCSS);
        return;
      }
      const file = resolve(staticDirectory, `.${pathname}`);
      if (!file.startsWith(`${staticDirectory}/`)) throw new Error("Invalid fixture path");
      const content = await readFile(file);
      response.writeHead(200, { "Content-Type": contentTypes[extname(file)] || "application/octet-stream" }).end(content);
    } catch {
      response.writeHead(404).end("Fixture asset not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });

  async function fixture(path, { config = defaults, library = fixtureLibrary, grantPermission = true } = {}) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    contexts.add(context);
    const page = await context.newPage();
    const errors = [];
    const externalRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== baseURL) {
        externalRequests.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript(({ config, library, grantPermission, baseURL }) => {
      const state = window.__extensionUIFixture = {
        config,
        library,
        messages: [],
        permissionRequests: [],
        optionsOpened: 0,
        injectedScripts: [],
        tabMessages: [],
        openedTabs: [],
        closed: 0,
      };
      window.close = () => { state.closed++; };
      window.chrome = {
        runtime: {
          id: "fixture-extension-only",
          getURL: (file) => `${baseURL}/${file}`,
          openOptionsPage: async () => { state.optionsOpened++; },
          onMessage: { addListener: () => {}, removeListener: () => {} },
          sendMessage: async (message) => {
            state.messages.push(structuredClone(message));
            let data;
            switch (message.type) {
              case "ww:config:get": data = state.config; break;
              case "ww:config:set": state.config = message.config; data = state.config; break;
              case "ww:preferences:get": data = state.config; break;
              case "ww:preferences:set": {
                const preferences = { ...message };
                delete preferences.type;
                Object.assign(state.config, preferences);
                data = state.config;
                break;
              }
              case "ww:models:list": data = { models: ["fixture-model"] }; break;
              case "ww:status": data = { ok: true, translationMode: state.config.translationMode, localOnly: true, modelConfigured: true }; break;
              case "ww:library:get": data = state.library; break;
              case "ww:library:open": state.openedTabs.push({ url: `${baseURL}/library.html` }); data = { ok: true }; break;
              case "ww:reader:open": state.openedTabs.push({ url: `${baseURL}/library.html#article=${message.id}` }); data = { ok: true }; break;
              case "ww:library:delete": {
                state.library.articles = state.library.articles.filter((article) => article.id !== message.id);
                state.library.jobs = state.library.jobs.filter((job) => job.id !== message.id);
                data = { ok: true };
                break;
              }
              case "ww:job:retry": {
                const job = state.library.jobs.find((job) => job.id === message.id);
                if (!job) return { ok: false, error: "Unknown fixture job" };
                job.status = "running";
                job.progress = { stage: "translating", completed: 0, total: 3 };
                delete job.error;
                data = job;
                break;
              }
              case "ww:word:update": {
                const word = state.library.words.find((word) => word.id === message.id);
                if (!word) return { ok: false, error: "Unknown fixture word" };
                word.user = { ...word.user, ...message.patch };
                for (const article of state.library.articles) {
                  for (const occurrence of article.version?.occurrences ?? []) {
                    if (occurrence.word.id === word.id) occurrence.word.user = word.user;
                  }
                }
                data = word.user;
                break;
              }
              case "ww:cache:clear": data = { ok: true }; break;
              default: return { ok: false, error: `Unsupported UI fixture message: ${message.type}` };
            }
            return { ok: true, data: structuredClone(data) };
          },
        },
        permissions: {
          request: (options) => {
            state.permissionRequests.push({ ...options, gestureTurn: Boolean(window.event?.isTrusted && ["click", "submit"].includes(window.event.type)), userActivation: navigator.userActivation.isActive });
            return Promise.resolve(grantPermission);
          },
          contains: async () => grantPermission,
        },
        tabs: {
          query: async () => [{ id: 42, title: "React state updates · fixture", url: "https://article.fixture.invalid/react" }],
          sendMessage: async (tabId, message) => { state.tabMessages.push({ tabId, message }); return { ok: true }; },
          create: async (options) => { state.openedTabs.push(options); return { id: 43, ...options }; },
        },
        scripting: {
          executeScript: async (options) => { state.injectedScripts.push(options); return []; },
        },
        storage: {
          onChanged: { addListener: () => {}, removeListener: () => {} },
          local: { get: async () => ({}), set: async () => {} },
        },
      };
    }, { config, library, grantPermission, baseURL });
    await page.goto(baseURL + path);
    return { page, errors, externalRequests };
  }

  async function check(name, action) {
    if (testFilter && !new RegExp(testFilter, "i").test(name)) return;
    const before = new Set(contexts);
    await action();
    for (const context of contexts) {
      if (!before.has(context)) {
        await context.close();
        contexts.delete(context);
      }
    }
    passed++;
    console.log(`✓ ${name}`);
  }

  await check("free translation is the default and saves without a website, invitation, API key, or host-permission prompt", async () => {
    const { page, errors, externalRequests } = await fixture("/options.html");
    await expect(page.locator('input[name="translation-mode"][value="free"]')).toBeChecked();
    await expect(page.locator("#ai-settings")).toBeHidden();
    await expect(page.locator("#test")).toBeHidden();
    await expect(page.locator("#server-url, #access-token")).toHaveCount(0);
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("已保存");
    const state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.config.translationMode, "free");
    assert.equal(state.config.aiApiKey, "");
    assert.equal(state.config.accessToken, "");
    assert.equal(state.permissionRequests.length, 0);
    assert.equal(state.messages.filter((message) => message.type === "ww:config:set").length, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: join(screenshots, "options-free-mobile.png"), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
  });

  await check("AI key entry is optional, advanced settings start collapsed, and saving requests only the chosen host during a user gesture", async () => {
    const { page, errors, externalRequests } = await fixture("/options.html");
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator('input[name="translation-mode"][value="ai"]').check();
    await expect(page.locator("#ai-key")).toBeVisible();
    await expect(page.locator("#ai-key")).toHaveAttribute("type", "password");
    await expect(page.locator("#ai-base-url")).toBeHidden();
    await expect(page.locator("#ai-model")).toBeHidden();
    await page.locator("#ai-key").fill("fixture-only-api-key");
    await page.getByText("高级设置 · 其他 AI 服务 / 模型", { exact: true }).click();
    await expect(page.locator("#ai-base-url")).toHaveValue("https://api.deepseek.com/v1");
    await page.locator("#ai-base-url").fill("http://localhost:43210/custom/v1/");
    await page.locator("#ai-model").fill("fixture-model");
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("已保存");
    let state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.config.translationMode, "ai");
    assert.equal(state.config.aiBaseUrl, "http://localhost:43210/custom/v1");
    assert.equal(state.config.aiModel, "fixture-model");
    assert.deepEqual(state.permissionRequests, [{ origins: ["http://localhost/*"], gestureTurn: true, userActivation: true }]);
    await page.locator("#test").click();
    await expect(page.locator("#status")).toContainText("连接成功");
    state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.messages.filter((message) => message.type === "ww:models:list").length, 1);
    await expect(page.locator("#model-list option")).toHaveAttribute("value", "fixture-model");
    await page.screenshot({ path: join(screenshots, "options-ai.png"), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
  });

  await check("declining AI host access keeps the previous free configuration", async () => {
    const { page, errors } = await fixture("/options.html", { grantPermission: false });
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator('input[name="translation-mode"][value="ai"]').check();
    await page.locator("#ai-key").fill("fixture-only-api-key");
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("需要允许连接");
    const state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.config.translationMode, "free");
    assert.equal(state.messages.filter((message) => message.type === "ww:config:set").length, 0);
    await expect(page.locator("#save")).toBeEnabled();
    assert.deepEqual(errors, []);
  });

  await check("switching back to free translation is not blocked by an unfinished AI URL", async () => {
    const { page, errors } = await fixture("/options.html");
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator('input[name="translation-mode"][value="ai"]').check();
    await page.getByText("高级设置 · 其他 AI 服务 / 模型", { exact: true }).click();
    await page.locator("#ai-base-url").fill("unfinished-url");
    await page.locator('input[name="translation-mode"][value="free"]').check();
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("已保存");
    const state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.config.translationMode, "free");
    assert.equal(state.permissionRequests.length, 0);
    assert.deepEqual(errors, []);
  });

  await check("the default popup opens article or selection translation directly and exposes the local library", async () => {
    const { page, errors, externalRequests } = await fixture("/popup.html");
    await expect(page.locator("#page-title")).toContainText("React state updates");
    await expect(page.locator("#mode-badge")).toHaveText("免费翻译");
    await page.locator("#library").click();
    await expect.poll(() => page.evaluate(() => window.__extensionUIFixture.openedTabs.length)).toBe(1);
    await page.locator("#retention").selectOption("high");
    await page.locator("#convert-article").click();
    await expect.poll(() => page.evaluate(() => window.__extensionUIFixture.closed)).toBe(1);
    let state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.optionsOpened, 0);
    assert.equal(state.config.retention, "high");
    assert.deepEqual(state.injectedScripts, [{ target: { tabId: 42 }, files: ["content.js"] }]);
    assert.deepEqual(state.tabMessages, [{ tabId: 42, message: { type: "ww:open", scope: "article" } }]);
    assert.equal(new URL(state.openedTabs[0].url).pathname, "/library.html");
    await page.locator("#convert-selection").click();
    await expect.poll(() => page.evaluate(() => window.__extensionUIFixture.tabMessages.length)).toBe(2);
    state = await page.evaluate(() => window.__extensionUIFixture);
    assert.deepEqual(state.tabMessages[1], { tabId: 42, message: { type: "ww:open", scope: "selection" } });
    assert.equal(state.permissionRequests.length, 0);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.screenshot({ path: join(screenshots, "popup-free.png"), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
  });

  if (!optionsOnly) {
    await check("the local library displays saved articles, original paragraphs, and newly favorited expressions", async () => {
      const library = structuredClone(fixtureLibrary);
      library.words[0].user.favorite = false;
      library.articles[0].version.occurrences[0].word.user.favorite = false;
      const { page, errors, externalRequests } = await fixture("/library.html", { library });
      await expect(page.locator(".article-title")).toHaveText(fixtureArticle.title);
      await expect(page.getByText(/免费翻译 · 规则选词/)).toBeVisible();
      await page.locator("#tab-words").click();
      await expect(page.getByText(/还没有收藏词/)).toBeVisible();
      await page.locator("#tab-articles").click();
      await page.locator(".article-title").click();
      await expect(page.locator(".local-reader h1")).toHaveText(fixtureArticle.title);
      await expect(page.getByText("免费翻译 · 规则选词", { exact: true })).toBeVisible();
      await expect(page.locator(".reading-term")).toHaveText(fixtureWord.lemma);
      await expect(page.locator(".term-gloss")).toContainText(fixtureWord.meaning);
      await page.getByText("查看这段原文", { exact: true }).click();
      await expect(page.locator(".paragraph-original")).toContainText(originalSentence);
      await page.getByRole("button", { name: "看英文原文", exact: true }).click();
      await expect(page.locator(".reading-paragraph")).toHaveText(originalSentence);
      await expect(page.locator(".reading-term")).toHaveCount(0);
      await page.getByRole("button", { name: "看学习版", exact: true }).click();
      await page.getByRole("combobox", { name: "中文释义", exact: true }).selectOption("click");
      await expect(page.locator(".term-gloss")).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(".reading-term").scrollIntoViewIfNeeded();
      const readingPosition = await page.evaluate(() => window.scrollY);
      await page.locator(".reading-term").click();
      const wordcard = page.getByRole("dialog", { name: fixtureWord.lemma, exact: true });
      await expect(wordcard).toBeVisible();
      await expect(wordcard).toContainText(originalSentence);
      await expect(wordcard).toContainText(fixtureWord.meaning);
      await wordcard.getByRole("button", { name: "收藏 ♡", exact: true }).click();
      await expect(wordcard.getByRole("button", { name: "已收藏 ♥", exact: true })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await page.screenshot({ path: join(screenshots, "library-wordcard-mobile.png"), fullPage: true });
      await wordcard.getByRole("button", { name: "关闭词卡", exact: true }).click();
      await expect(wordcard).toBeHidden();
      assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - readingPosition) <= 1, "Closing a word card must preserve the reading position");
      await page.locator("#tab-words").click();
      await expect(page.locator(".word-title")).toHaveText(fixtureWord.lemma);
      await expect(page.locator(".saved-word")).toContainText(originalSentence);
      const state = await page.evaluate(() => window.__extensionUIFixture);
      assert.deepEqual(state.messages.filter((message) => message.type === "ww:word:update"), [{ type: "ww:word:update", id: fixtureWord.id, patch: { favorite: true } }]);
      assert.equal(state.config.glossMode, "click");
      await page.screenshot({ path: join(screenshots, "library-favorites-mobile.png"), fullPage: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(externalRequests, []);
    });

    await check("deleting a local article requires confirmation while its explicitly favorited word remains visible", async () => {
      const { page, errors } = await fixture("/library.html");
      await expect(page.locator(".article-title")).toBeVisible();
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.getByRole("button", { name: "删除", exact: true }).click();
      assert.equal(await page.evaluate(() => window.__extensionUIFixture.messages.filter((message) => message.type === "ww:library:delete").length), 0);
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "删除", exact: true }).click();
      await expect(page.getByText(/还没有文章/)).toBeVisible();
      await page.locator("#tab-words").click();
      await expect(page.locator(".word-title")).toHaveText(fixtureWord.lemma);
      assert.equal(await page.evaluate(() => window.__extensionUIFixture.messages.filter((message) => message.type === "ww:library:delete").length), 1);
      assert.deepEqual(errors, []);
    });

    await check("pending and failed local jobs remain visible before an article exists and retry only on request", async () => {
      const library = {
        localOnly: true,
        articles: [],
        words: [],
        jobs: [
          { id: "pending-fixture-job", title: "正在读取的技术文章", sourceUrl: "https://article.fixture.invalid/pending", translationMode: "free", status: "running", progress: { stage: "translating", completed: 1, total: 4 } },
          { id: "failed-fixture-job", title: "稍后重试的技术文章", sourceUrl: "https://article.fixture.invalid/failed", translationMode: "ai", status: "failed", error: "测试连接中断，请稍后重试。" },
        ],
      };
      const { page, errors, externalRequests } = await fixture("/library.html", { library });
      await expect(page.getByRole("heading", { name: "正在读取的技术文章", exact: true })).toBeVisible();
      await expect(page.getByText("正在翻译 1 / 4 段…", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "稍后重试的技术文章", exact: true })).toBeVisible();
      await expect(page.getByText("测试连接中断，请稍后重试。", { exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => window.__extensionUIFixture.messages.filter((message) => message.type === "ww:job:retry").length), 0);
      await page.getByRole("button", { name: "重试翻译", exact: true }).click();
      await expect(page.getByText("正在翻译 0 / 3 段…", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "重试翻译", exact: true })).toHaveCount(0);
      assert.deepEqual(await page.evaluate(() => window.__extensionUIFixture.messages.filter((message) => message.type === "ww:job:retry")), [{ type: "ww:job:retry", id: "failed-fixture-job" }]);
      await page.evaluate(() => { window.__extensionUIFixture.library.jobs[0].progress.completed = 2; });
      await expect(page.getByText("正在翻译 2 / 4 段…", { exact: true })).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await page.screenshot({ path: join(screenshots, "library-jobs-mobile.png"), fullPage: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(externalRequests, []);
    });
  }

  await check("the four-step install page copies browser management addresses and fits a mobile screen", async () => {
    const { page, errors, externalRequests } = await fixture("/setup.html");
    await expect(page.getByRole("heading", { name: "把小精灵装进浏览器", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^1\s*下载$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^2\s*解压$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^3\s*打开安装页$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^4\s*加进浏览器$/ })).toBeVisible();
    await expect(page.getByText(/邀请码/)).toHaveCount(0);
    await page.getByRole("button", { name: "复制 Chrome 安装页地址", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("已复制！粘贴到浏览器最上方的地址栏，按回车。");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "chrome://extensions");
    await page.getByRole("button", { name: "复制 Edge 安装页地址", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "edge://extensions");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: join(screenshots, "install-mobile.png"), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
  });

  await check("blocked clipboard access offers a selected installation address for manual copying", async () => {
    const { page, errors } = await fixture("/setup.html");
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => { throw new DOMException("Fixture clipboard denied", "NotAllowedError"); },
    }));
    await page.getByRole("button", { name: "复制 Chrome 安装页地址", exact: true }).click();
    const address = page.getByRole("textbox", { name: "安装页地址", exact: true });
    await expect(address).toHaveValue("chrome://extensions");
    await expect(page.getByRole("status")).toContainText("请复制下面的地址");
    await expect.poll(() => address.evaluate((input) => input.selectionEnd - input.selectionStart)).toBe("chrome://extensions".length);
    assert.deepEqual(errors, []);
  });

  console.log(`\n${passed} extension/setup browser UI checks passed. chrome.* is a test bridge; installation, permission dialogs, worker lifecycle, and real providers were not tested.`);
  console.log(`Screenshots: ${screenshots}`);
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(temporary, { recursive: true, force: true });
}
