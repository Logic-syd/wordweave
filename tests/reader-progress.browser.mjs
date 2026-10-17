/**
 * Browser component checks for the real Reader component. The local HTTP server
 * serves an esbuild bundle; article APIs below are explicit fixtures. This does
 * not start Next.js, use a database, or call a model API.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "wordweave-reader-progress-"));
const screenshots = join(repository, "test-results", "reader-progress");
const settings = {
  retention: "medium",
  level: "A2",
  minutes: "3-5",
  newWordCount: 5,
  topic: "购物",
  requestedWords: "",
  reviewOnly: false,
};
const articleId = "reader-progress-fixture";
const paragraph = "React batches state updates to avoid unnecessary re-renders.";

function article(overrides = {}) {
  return {
    id: articleId,
    title: "React 状态更新 · 浏览器组件测试夹具",
    mode: "tech",
    language: "en",
    sourceUrl: null,
    sourceText: paragraph,
    sourceBlocks: [{
      id: "p0001",
      kind: "paragraph",
      original: paragraph,
      masked: paragraph,
      protected: {},
    }],
    origin: "imported",
    generationStartedAt: null,
    generationError: null,
    generationProgress: null,
    createdAt: new Date().toISOString(),
    version: null,
    progress: null,
    defaultGlossMode: "first",
    ...overrides,
  };
}

function activeArticle(age = 8_000, completed = 1) {
  const startedAt = new Date(Date.now() - age).toISOString();
  return article({
    generationStartedAt: startedAt,
    generationProgress: {
      stage: "translating",
      completed,
      total: 3,
      startedAt,
      updatedAt: startedAt,
      message: "正在生成下一组段落，已完成内容会逐步更新。",
    },
  });
}

let browser;
let server;
let passed = 0;
const pages = new Set();

try {
  await mkdir(screenshots, { recursive: true });
  await build({
    absWorkingDir: repository,
    stdin: {
      resolveDir: repository,
      loader: "tsx",
      contents: `
        import { createElement } from "react";
        import { createRoot } from "react-dom/client";
        import { Reader } from "./src/components/reader";
        const root = createRoot(document.getElementById("reader-root"));
        window.mountReader = (props) => root.render(createElement(Reader, props));
      `,
    },
    outfile: join(temporary, "fixture.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{
      name: "next-link-component-fixture",
      setup(bundler) {
        bundler.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "next-link-fixture",
          namespace: "fixture",
        }));
        bundler.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: 'import { createElement } from "react"; export default function Link(props) { return createElement("a", props); }',
          resolveDir: repository,
          loader: "js",
        }));
      },
    }],
  });
  const stylesheetPath = join(repository, "src/app/globals.css");
  const stylesheet = await postcss([tailwindcss()]).process(
    await readFile(stylesheetPath, "utf8"),
    { from: stylesheetPath },
  );
  const script = await readFile(join(temporary, "fixture.js"));
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reader component fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><aside style="padding:10px 18px;background:#f5e5eb;color:#714253;font-size:12px">组件浏览器测试夹具 · 模拟文章接口 · 未调用真实模型</aside><div id="reader-root"></div><script src="/fixture.js"></script></body></html>`;
  server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const [contentType, body] = pathname === "/fixture.js"
      ? ["text/javascript", script]
      : pathname === "/fixture.css"
        ? ["text/css", stylesheet.css]
        : ["text/html; charset=utf-8", html];
    response.writeHead(200, { "Content-Type": contentType });
    response.end(body);
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });

  async function fixture(initial, { autoGenerate = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    pages.add(page);
    const state = {
      article: initial,
      gets: 0,
      posts: 0,
      failGet: false,
      postFinished: false,
      remoteRequests: [],
      errors: [],
      releasePost: () => {},
    };
    page.on("pageerror", (error) => state.errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL) {
        state.remoteRequests.push(request.url());
        return route.abort();
      }
      if (url.pathname === `/api/articles/${articleId}/generate`) {
        assert.equal(request.method(), "POST");
        state.posts++;
        await new Promise((resolvePost) => { state.releasePost = resolvePost; });
        state.postFinished = true;
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === `/api/articles/${articleId}/progress`) {
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === `/api/articles/${articleId}`) {
        state.gets++;
        return state.failGet
          ? route.fulfill({ status: 503, json: { error: "Fixture connection unavailable" } })
          : route.fulfill({ json: state.article });
      }
      return route.continue();
    });
    const mount = async () => {
      await page.waitForFunction(() => typeof window.mountReader === "function");
      await page.evaluate((props) => window.mountReader(props), {
        initial,
        configured: true,
        autoGenerate,
        initialSettings: settings,
      });
      await expect(page.getByRole("heading", { name: initial.title })).toBeVisible();
    };
    await page.goto(`${baseURL}/fixture`);
    await mount();
    return { page, state, mount };
  }

  async function check(name, action) {
    const before = new Set(pages);
    await action();
    for (const page of pages) {
      if (!before.has(page)) {
        await page.close();
        pages.delete(page);
      }
    }
    passed++;
    console.log(`✓ ${name}`);
  }

  await check("a pending generation POST does not block real progress polling or elapsed time", async () => {
    const { page, state } = await fixture(article());
    state.article = activeArticle();
    await page.getByRole("button", { name: "生成设置", exact: true }).click();
    const generate = page.getByRole("button", { name: "明确重新生成", exact: true });
    await generate.click();
    await expect(page.getByText("正在生成学习版", { exact: true })).toBeVisible();
    await expect(page.getByText("已完成 1 / 3 块", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "已完成 1 块，共 3 块" })).toBeVisible();
    await expect(page.getByText(/已用时 [1-9]\d* 秒/)).toBeVisible();
    await expect(generate).toBeDisabled();
    assert.equal(state.posts, 1);
    assert.equal(state.postFinished, false, "The original POST must still be pending while GET progress is visible");
    assert.ok(state.gets >= 1);

    await page.getByRole("button", { name: "关闭生成设置", exact: true }).click();
    await page.screenshot({ path: join(screenshots, "desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("已完成 1 / 3 块", { exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Mobile reader must not overflow horizontally");
    await page.screenshot({ path: join(screenshots, "mobile.png"), fullPage: true });

    state.article = article();
    state.releasePost();
    await expect(page.getByRole("region", { name: "生成进度", exact: true })).toHaveCount(0);
    assert.deepEqual(state.errors, []);
  });

  await check("a server-recorded failure ends a still-pending POST and enables explicit retry", async () => {
    const { page, state } = await fixture(article());
    state.article = activeArticle();
    await page.getByRole("button", { name: "生成设置", exact: true }).click();
    const generate = page.getByRole("button", { name: "明确重新生成", exact: true });
    await generate.click();
    try {
      // Observe the active server task before reporting its terminal failure.
      await expect(page.getByText("已完成 1 / 3 块", { exact: true })).toBeVisible();
      state.article = article({ generationError: "模型处理超时，请稍后重新生成。" });
      await expect(page.getByRole("alert")).toContainText("模型处理超时，请稍后重新生成。");
      await expect(page.getByRole("region", { name: "生成进度", exact: true })).toHaveCount(0);
      await expect(generate).toBeEnabled();
      await expect(page.getByText(/等待响应的时间较长/)).toHaveCount(0);
      assert.equal(state.posts, 1);
      assert.equal(state.postFinished, false, "Failure must become actionable without waiting for the POST response");
      assert.deepEqual(state.errors, []);
    } finally {
      state.releasePost();
      await expect.poll(() => state.postFinished).toBe(true);
    }
  });

  await check("a saved server version replaces a still-pending POST with readable learning content", async () => {
    const { page, state } = await fixture(article({
      progress: { paragraphId: null, view: "original", glossMode: "first", completed: false },
    }));
    state.article = activeArticle();
    await page.getByRole("button", { name: "生成设置", exact: true }).click();
    await page.getByRole("button", { name: "明确重新生成", exact: true }).click();
    try {
      await expect(page.getByText("已完成 1 / 3 块", { exact: true })).toBeVisible();
      const learningText = "React 会批量处理状态更新，避免不必要的重新渲染。";
      state.article = article({
        version: {
          id: "newly-saved-version-fixture",
          settings,
          coverage: { newWords: [], reviewWords: [], requestedNew: 0, requestedReview: 0, missing: [] },
          createdAt: new Date().toISOString(),
          paragraphs: [{ id: "saved-paragraph", sourceId: "p0001", position: 0, original: paragraph, segments: [{ type: "text", text: learningText }] }],
          occurrences: [],
        },
      });
      await expect(page.getByText(learningText, { exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "生成进度", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "关闭生成设置", exact: true })).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      assert.equal(state.posts, 1);
      assert.equal(state.postFinished, false, "The saved learning version must appear before the POST responds");
      assert.deepEqual(state.errors, []);
    } finally {
      state.releasePost();
      await expect.poll(() => state.postFinished).toBe(true);
    }
  });

  await check("an existing server task resumes after rerender and page reload without another POST", async () => {
    const initial = activeArticle();
    const { page, state, mount } = await fixture(initial, { autoGenerate: true });
    state.article = activeArticle(8_000, 2);
    await expect(page.getByText("已完成 2 / 3 块", { exact: true })).toBeVisible();
    const beforeRerender = state.gets;
    await mount();
    await expect.poll(() => state.gets).toBeGreaterThan(beforeRerender);
    const beforeReload = state.gets;
    await page.reload();
    await mount();
    await expect.poll(() => state.gets).toBeGreaterThan(beforeReload);
    await expect(page.getByText("已完成 2 / 3 块", { exact: true })).toBeVisible();
    assert.equal(state.posts, 0);
    assert.deepEqual(state.errors, []);
  });

  await check("a temporary polling failure shows a connection hint and recovers automatically", async () => {
    const { page, state } = await fixture(activeArticle());
    state.failGet = true;
    const connection = page.getByText(/^暂时无法更新进度/);
    await expect(connection).toBeVisible();
    state.failGet = false;
    state.article = activeArticle(8_000, 2);
    await expect(page.getByText("已完成 2 / 3 块", { exact: true })).toBeVisible();
    await expect(connection).toHaveCount(0);
    assert.equal(state.posts, 0);
    assert.deepEqual(state.errors, []);
  });

  await check("six minutes without an update exposes status checking and explicit regeneration settings", async () => {
    const { page, state } = await fixture(activeArticle(6 * 60_000 + 1_000));
    await expect(page.getByText("进度较长时间没有更新", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "检查设置并重新生成", exact: true }).click();
    await expect(page.getByRole("heading", { name: "调整这篇学习材料", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "明确重新生成", exact: true })).toBeEnabled();
    assert.equal(state.posts, 0, "Opening settings must not spend another API call");
    state.article = article();
    await page.getByRole("button", { name: "检查最新进度", exact: true }).click();
    await expect(page.getByText("进度较长时间没有更新", { exact: true })).toHaveCount(0);
    assert.equal(state.gets, 1);
    assert.deepEqual(state.errors, []);
  });

  await check("Markdown images remain readable alt placeholders without remote image requests in either view", async () => {
    const source = `${paragraph}\n\n![架构示意图](https://reader-tracking.invalid/pixel.png)`;
    const initial = article({
      sourceText: source,
      sourceBlocks: [{ id: "p0001", kind: "paragraph", original: source, masked: source, protected: {} }],
      version: {
        id: "version-fixture",
        settings,
        coverage: { newWords: [], reviewWords: [], requestedNew: 0, requestedReview: 0, missing: [] },
        createdAt: new Date().toISOString(),
        paragraphs: [{ id: "paragraph-fixture", sourceId: "p0001", position: 0, original: source, segments: [{ type: "text", text: source }] }],
        occurrences: [],
      },
    });
    const { page, state } = await fixture(initial);
    await expect(page.getByText("[图片：架构示意图]", { exact: true }).first()).toBeVisible();
    await page.getByText("查看英文原文", { exact: true }).click();
    const placeholders = page.getByText("[图片：架构示意图]", { exact: true });
    await expect(placeholders).toHaveCount(2);
    await expect(placeholders.nth(1)).toBeVisible();
    await page.getByRole("button", { name: "英文原文", exact: true }).click();
    await expect(page.getByText("[图片：架构示意图]", { exact: true })).toBeVisible();
    await expect(page.locator("img")).toHaveCount(0);
    assert.deepEqual(state.remoteRequests, []);
    assert.deepEqual(state.errors, []);
  });

  console.log(`\n${passed} Reader browser component checks passed. API responses are fixtures; no real model, Next server, or database was used.`);
  console.log(`Screenshots: ${screenshots}`);
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(temporary, { recursive: true, force: true });
}
