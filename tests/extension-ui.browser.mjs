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
import { uiName } from "./ui-name.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testFilter = process.argv.find((argument) => argument.startsWith("--match="))?.slice("--match=".length);
const temporary = await mkdtemp(join(tmpdir(), "wordweave-extension-ui-"));
const screenshots = join(repository, "test-results", "extension-ui");
const defaults = {
  translationMode: "free",
  aiProvider: "",
  aiBaseUrl: "",
  aiApiKey: "",
  aiModel: "",
  serverUrl: "",
  accessToken: "",
  retention: "medium",
  glossMode: "first",
};
// Legacy data is a sentinel only: the new popup/settings must leave it untouched.
const fixtureLibrary = { version: 1, jobs: [{ id: "legacy-article" }], words: [{ id: "legacy-favorite", favorite: true }] };

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
    entryPoints: ["options", "popup"].map((name) => join(repository, "extension/src", `${name}.ts`)),
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
    // Standalone component fixture has no Next router; exercise links as anchors.
    plugins: [{
      name: "next-link-component-fixture",
      setup(bundler) {
        bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link-fixture", namespace: "fixture" }));
        bundler.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: 'import { createElement } from "react"; export default function Link(props) { return createElement("a", props); }',
          resolveDir: repository,
          loader: "js",
        }));
      },
    }],
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
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
        "Content-Security-Policy": "script-src 'self'; object-src 'none'; base-uri 'none'",
      }).end(content);
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

  async function fixture(path, { config = defaults, library = fixtureLibrary, grantPermission = true, permissionDelay = 0 } = {}) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    contexts.add(context);
    const page = await context.newPage();
    const errors = [];
    const externalRequests = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error("UI fixture error:", error.message); });
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== baseURL) {
        externalRequests.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript(({ config, library, grantPermission, permissionDelay, baseURL }) => {
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
              case "ww:cache:clear": data = { ok: true }; break;
              default: return { ok: false, error: `Unsupported UI fixture message: ${message.type}` };
            }
            return { ok: true, data: structuredClone(data) };
          },
        },
        permissions: {
          request: (options) => {
            state.permissionRequests.push({ ...options, gestureTurn: Boolean(window.event?.isTrusted && ["click", "submit"].includes(window.event.type)), userActivation: navigator.userActivation.isActive });
            return new Promise((resolvePermission) => setTimeout(() => resolvePermission(grantPermission), permissionDelay));
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
    }, { config, library, grantPermission, permissionDelay, baseURL });
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
    await expect(page.locator("#ai-provider")).toHaveValue("");
    await page.locator("#ai-provider").selectOption("custom");
    await page.locator("#ai-base-url").fill("http://localhost:43210/custom/v1/");
    await page.locator("#ai-key").fill("fixture-only-api-key");
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

  await check("official provider selection discloses the destination and session storage before saving, and never carries a key to another destination", async () => {
    const { page, errors, externalRequests } = await fixture("/options.html");
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator('input[name="translation-mode"][value="ai"]').check();
    await expect(page.locator("#credential-privacy")).toBeVisible();
    await expect(page.locator("#credential-privacy")).toContainText("不会上传到语境服务器");
    await expect(page.locator("#credential-privacy")).toContainText("本次浏览器会话");
    for (const [provider, origin] of [
      ["openai", "https://api.openai.com"],
      ["anthropic", "https://api.anthropic.com"],
      ["xai", "https://api.x.ai"],
      ["deepseek", "https://api.deepseek.com"],
    ]) {
      await page.locator("#ai-provider").selectOption(provider);
      await expect(page.locator("#ai-base-url")).toHaveValue(`${origin}/v1`);
      await expect(page.locator("#ai-base-url")).toHaveAttribute("readonly", "");
      await expect(page.locator("#ai-destination")).toContainText(origin);
      await expect(page.locator("#ai-key")).toHaveValue("");
      await expect(page.locator("#ai-model")).toHaveValue("");
      await page.locator("#ai-key").fill(`fixture-only-${provider}-key`);
      if (provider === "openai") {
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: join(screenshots, "options-provider-mobile.png"), fullPage: true });
      }
      await page.locator("#save").click();
      await expect(page.locator("#status")).toContainText("已保存到本次浏览器会话");
      const state = await page.evaluate(() => window.__extensionUIFixture);
      assert.equal(state.config.aiProvider, provider);
      assert.equal(state.config.aiBaseUrl, `${origin}/v1`);
      assert.deepEqual(state.permissionRequests.at(-1).origins, [`${origin}/*`]);
      assert.equal(state.messages.filter((message) => message.type === "ww:models:list").length, 0);
    }
    await page.locator("#ai-provider").selectOption("custom");
    await expect(page.locator("#ai-base-url")).not.toHaveAttribute("readonly", "");
    await page.locator("#ai-base-url").fill("https://fixture.example/v1");
    await page.locator("#ai-key").fill("fixture-custom-key");
    await page.locator("#ai-model").fill("fixture-model");
    await page.locator("#ai-base-url").fill("https://different.example/v1");
    await expect(page.locator("#ai-key")).toHaveValue("");
    await expect(page.locator("#ai-model")).toHaveValue("");
    await expect(page.locator("#ai-destination")).toContainText("https://different.example");
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
  });

  await check("pending AI permission locks configuration and prevents duplicate saves", async () => {
    const { page, errors } = await fixture("/options.html", { permissionDelay: 800 });
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator('input[name="translation-mode"][value="ai"]').check();
    await page.locator("#ai-provider").selectOption("anthropic");
    await page.locator("#ai-key").fill("fixture-claude-key");
    await page.locator("#save").click();
    await expect(page.locator("#ai-provider")).toBeDisabled();
    await expect(page.locator("#ai-key")).toBeDisabled();
    await page.evaluate(() => document.querySelector("#config-form").requestSubmit());
    await expect(page.locator("#status")).toContainText("已保存");
    await expect(page.locator("#ai-provider")).toBeEnabled();
    const state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.permissionRequests.length, 1);
    assert.equal(state.messages.filter((message) => message.type === "ww:config:set").length, 1);
    assert.equal(state.config.aiProvider, "anthropic");
    assert.deepEqual(errors, []);
  });

  await check("saved keys can be removed after confirmation without deleting local articles or making network requests", async () => {
    const { page, errors, externalRequests } = await fixture("/options.html", { config: {
      ...defaults, translationMode: "ai", aiApiKey: "fixture-only-saved-key", accessToken: "fixture-old-owner-token",
    } });
    await expect(page.locator("#forget-key")).toBeVisible();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#forget-key").click();
    let state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.config.aiApiKey, "fixture-only-saved-key");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#forget-key").click();
    await expect(page.locator("#status")).toContainText("已清除 Key");
    await expect(page.locator("#forget-key")).toBeHidden();
    await expect(page.locator('input[name="translation-mode"][value="free"]')).toBeChecked();
    state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.config.aiApiKey, "");
    assert.equal(state.config.accessToken, "");
    assert.deepEqual(state.library, fixtureLibrary);
    assert.deepEqual(state.permissionRequests, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
  });

  await check("settings clear translation cache only after explicit confirmation", async () => {
    const { page, errors } = await fixture("/options.html");
    await expect(page.locator("#save")).toBeEnabled();
    await expect(page.locator("#library")).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#clear-cache").click();
    assert.equal(await page.evaluate(() => window.__extensionUIFixture.messages.filter((message) => message.type === "ww:cache:clear").length), 0);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#clear-cache").click();
    await expect(page.locator("#status")).toContainText("翻译缓存已清除");
    assert.equal(await page.evaluate(() => window.__extensionUIFixture.messages.filter((message) => message.type === "ww:cache:clear").length), 1);
    assert.deepEqual(errors, []);
  });

  await check("privacy is available in the packaged popup/settings without a website or account", async () => {
    for (const filename of ["popup.html", "options.html"]) {
      const { page } = await fixture(`/${filename}`);
      await expect(page.getByRole("link", { name: "隐私说明", exact: true })).toHaveAttribute("href", "privacy.html");
    }
    const { page, errors, externalRequests } = await fixture("/privacy.html");
    await expect(page.getByRole("heading", { name: "语境插件隐私说明", exact: true })).toBeVisible();
    await expect(page.getByText(/translate\.googleapis\.com/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
  });

  await check("declining AI host access keeps the previous free configuration", async () => {
    const { page, errors } = await fixture("/options.html", { grantPermission: false });
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator('input[name="translation-mode"][value="ai"]').check();
    await page.locator("#ai-provider").selectOption("openai");
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
    await page.locator("#ai-provider").selectOption("custom");
    await page.locator("#ai-base-url").fill("unfinished-url");
    await page.locator('input[name="translation-mode"][value="free"]').check();
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("已保存");
    const state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.config.translationMode, "free");
    assert.equal(state.permissionRequests.length, 0);
    assert.deepEqual(errors, []);
  });

  await check("the default popup opens article or selection translation directly with no article-library entry", async () => {
    const { page, errors, externalRequests } = await fixture("/popup.html");
    await expect(page.locator("#page-title")).toContainText("React state updates");
    await expect(page.locator("#mode-badge")).toHaveText("免费翻译");
    await expect(page.locator("#library")).toHaveCount(0);
    await page.locator("#retention").selectOption("high");
    await page.locator("#convert-article").click();
    await expect.poll(() => page.evaluate(() => window.__extensionUIFixture.closed)).toBe(1);
    let state = await page.evaluate(() => window.__extensionUIFixture);
    assert.equal(state.optionsOpened, 0);
    assert.equal(state.config.retention, "high");
    assert.deepEqual(state.injectedScripts, [{ target: { tabId: 42 }, files: ["content.js"] }]);
    assert.deepEqual(state.tabMessages, [{ tabId: 42, message: { type: "ww:open", scope: "article" } }]);
    assert.equal(state.openedTabs.length, 0);
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

  await check("the four-step install page copies browser management addresses and fits a mobile screen", async () => {
    const { page, errors, externalRequests } = await fixture("/setup.html");
    await expect(page.getByRole("heading", { name: uiName("把小精灵装进浏览器") })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^1\s*下载(?:\s|$)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^2\s*解压(?:\s|$)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^3\s*打开安装页(?:\s|$)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^4\s*加进浏览器(?:\s|$)/ })).toBeVisible();
    await expect(page.getByText(/邀请码/)).toHaveCount(0);
    await page.getByRole("button", { name: uiName("复制 Chrome 安装页地址") }).click();
    await expect(page.getByRole("status")).toContainText("已复制！粘贴到浏览器最上方的地址栏，按回车。");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "chrome://extensions");
    await page.getByRole("button", { name: uiName("复制 Edge 安装页地址") }).click();
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
    await page.getByRole("button", { name: uiName("复制 Chrome 安装页地址") }).click();
    const address = page.getByRole("textbox", { name: uiName("安装页地址") });
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
