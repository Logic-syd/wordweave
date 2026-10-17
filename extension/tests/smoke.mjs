/**
 * Real unpacked MV3 extension -> real production Next server -> temporary local
 * PostgreSQL. Only the model provider is a deterministic local HTTP fixture.
 * A temporary manifest grants localhost so headless Chromium does not need an
 * OS permission dialog. The shipped manifest and default permissions stay intact.
 * --content-harness explicitly replaces chrome.runtime with a test HTTP bridge
 * when managed browser policy prohibits unpacked extensions. That mode does not
 * claim to validate installation, popup/options, permissions or worker lifecycle.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const results = path.join(root, "test-results/extension");
const originalDatabaseUrl = process.env.DATABASE_URL;
const sentence = "React batches state updates to avoid unnecessary re-renders.";
const expression = "avoid unnecessary re-renders";
const databaseName = `wordweave_extension_test_${randomUUID().replaceAll("-", "")}`;
const accessToken = randomBytes(32).toString("hex");
const checks = [];
const harness = process.argv.includes("--content-harness");
const harnessPreferences = { retention: "medium", glossMode: "first" };
const harnessRequestKeys = new Map();
let admin, database, temporary, serverProcess, context, fixtureServer, modelServer;
let databaseCreated = false;
let serverLog = "";
let modelRequests = 0;
let modelMode = "valid";
let popupMode = harness ? "not-tested-content-harness" : "toolbar";
let testDatabaseUrl;

function report(message) { checks.push(message); console.log(`✓ ${message}`); }
function safeLog(value) {
  return String(value).replaceAll(accessToken, "[test-token]")
    .replaceAll(originalDatabaseUrl ?? "unused-database-url", "[database-url]")
    .replaceAll(testDatabaseUrl ?? "unused-test-url", "[test-database-url]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[database-url]");
}
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function freePort() {
  const server = createServer();
  await listen(server);
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function until(action, description, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const result = await action(); if (result) return result; }
    catch (error) { last = error; }
    await delay(150);
  }
  throw new Error(`Timed out: ${description}${last ? ` (${safeLog(last.message)})` : ""}`);
}
function spawnNode(args, env) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-16000); });
  return { child, output: () => output };
}
function generation(paragraphs) {
  const plainFixture = (value) => value.replace(/\\([.-])/g, "$1");
  const used = paragraphs.some((paragraph) => plainFixture(paragraph.source).includes(sentence));
  return {
    title: "React 状态更新：本地模型测试夹具",
    terms: used ? [{
      id: "expression", lemma: expression, partOfSpeech: "phrase", meaning: "避免不必要的重新渲染",
      grammar: { article: "", plural: "", infinitive: "", currentForm: "", note: "avoid 后可以接名词或动名词。" },
      explanation: "用 avoid unnecessary… 表达避免不必要的工作。此内容是测试夹具。",
      example: sentence, exampleTranslation: "React 批量处理状态更新，以避免不必要的重新渲染。", category: "general",
    }] : [],
    paragraphs: paragraphs.map((paragraph) => {
      if (plainFixture(paragraph.source).includes(sentence)) return {
        id: paragraph.id,
        segments: [
          { type: "text", text: "React 会批量处理状态更新，以 " },
          { type: "term", text: expression, termId: "expression", meaning: "避免不必要的重新渲染", sentence },
          { type: "text", text: "。" + plainFixture(paragraph.source).replace(sentence, "") },
        ],
      };
      const heading = paragraph.source.match(/^(#{1,6})\s/);
      return { id: paragraph.id, segments: [{ type: "text", text: heading ? `${heading[1]} 状态更新测试` : `测试解释：${paragraph.source}` }] };
    }),
  };
}

try {
  if (!originalDatabaseUrl) throw new Error("DATABASE_URL is required; use a local PostgreSQL instance with CREATE DATABASE permission.");
  const databaseUrl = new URL(originalDatabaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname))
    throw new Error("Refusing to run against a non-local PostgreSQL host. This test only creates temporary databases on localhost.");
  await access(path.join(root, ".next/BUILD_ID"));
  await access(path.join(root, ".next/server/app/api/extension/articles/route.js"));
  await access(path.join(root, "extension/dist/manifest.json"));
  await mkdir(results, { recursive: true });
  temporary = await mkdtemp(path.join(tmpdir(), "wordweave-extension-smoke-"));
  admin = new pg.Client({ connectionString: originalDatabaseUrl });
  if (!["localhost", "127.0.0.1", "::1"].includes(admin.host))
    throw new Error("Refusing PostgreSQL host overrides that point outside localhost.");
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  databaseUrl.pathname = `/${databaseName}`;
  testDatabaseUrl = databaseUrl.href;
  database = new pg.Client({ connectionString: testDatabaseUrl });
  await database.connect();
  const env = {
    ...process.env, DATABASE_URL: testDatabaseUrl, EXTENSION_ACCESS_TOKEN: accessToken,
    TRIAL_ACCESS_TOKENS: JSON.stringify({ personal: accessToken }), SEED_DEMOS: "false", NODE_ENV: "production",
    GENERATION_DAILY_LIMIT: "20", GENERATION_DAILY_CHAR_LIMIT: "120000",
    GENERATION_GLOBAL_DAILY_LIMIT: "100", GENERATION_GLOBAL_DAILY_CHAR_LIMIT: "600000", GENERATION_MAX_CONCURRENT: "2",
  };
  const migration = spawnNode(["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
  const [migrationCode] = await once(migration.child, "exit");
  assert.equal(migrationCode, 0, `Migrations failed: ${safeLog(migration.output())}`);
  report("Created and migrated an isolated temporary local PostgreSQL database");

  const html = await readFile(path.join(root, "extension/tests/fixtures/article.html"));
  fixtureServer = createServer((_request, response) => { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); });
  const fixtureUrl = await listen(fixtureServer);
  modelServer = createServer(async (request, response) => {
    if (request.url !== "/v1/chat/completions" || request.method !== "POST") { response.writeHead(404).end(); return; }
    modelRequests++;
    const mode = modelMode;
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      const paragraphs = JSON.parse(payload.messages[1].content).data.paragraphs;
      assert.ok(Array.isArray(paragraphs) && paragraphs.length);
      assert.ok(!JSON.stringify(paragraphs).includes("Never send or rewrite this code block"));
      assert.ok(!JSON.stringify(paragraphs).includes("Hidden secret fixture"));
      assert.ok(!JSON.stringify(paragraphs).includes("Private form content"));
      await delay(650);
      response.setHeader("Content-Type", "application/json");
      if (mode === "http-failure") { response.writeHead(503).end(JSON.stringify({ error: "Intentional local fixture failure" })); return; }
      response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: mode === "invalid" ? "not valid JSON" : JSON.stringify(generation(paragraphs)) } }] }));
    } catch (error) { response.writeHead(500).end(JSON.stringify({ error: safeLog(error.message) })); }
  });
  const modelUrl = await listen(modelServer);
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;
  const app = spawnNode(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    ...env, LLM_API_KEY: "local-smoke-fixture", LLM_BASE_URL: `${modelUrl}/v1`, LLM_MODEL: "local-smoke-fixture-model",
  });
  serverProcess = app.child;
  serverProcess.stdout.on("data", (chunk) => { serverLog = (serverLog + chunk).slice(-16000); });
  serverProcess.stderr.on("data", (chunk) => { serverLog = (serverLog + chunk).slice(-16000); });
  await until(async () => {
    if (serverProcess.exitCode !== null) throw new Error(`Next exited: ${safeLog(app.output())}`);
    const response = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  }, "production Next server readiness");
  assert.equal((await fetch(`${appUrl}/api/extension/status`)).status, 401);
  assert.equal((await fetch(`${appUrl}/api/extension/status`, { headers: { Authorization: `Bearer ${accessToken}`, Origin: fixtureUrl } })).status, 403);
  report("Real extension API rejects missing credentials and ordinary webpage origins");

  const extensionPath = path.join(temporary, "extension");
  await cp(path.join(root, "extension/dist"), extensionPath, { recursive: true });
  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // Test-only grant; no broad permission is added to the distributed package.
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  context = await chromium.launchPersistentContext(path.join(temporary, "profile"), {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true,
    viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: harness ? [] : ["--disable-extensions"],
    args: harness ? ["--no-sandbox"] : ["--no-sandbox", `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  context.setDefaultTimeout(15000);
  let worker, popupUrl;
  if (harness) {
    console.log("MODE: content-harness. Browser extension loading is NOT tested. A test-only chrome.runtime bridge calls the real HTTP API; identical inputs reuse an idempotency key, while every submit reaches the real backend.");
    await context.exposeBinding("__wordweaveSmokeMessage", async (_source, message) => {
      try {
        if (message.type === "ww:preferences:get") return { ok: true, data: { ...harnessPreferences } };
        if (message.type === "ww:preferences:set") {
          if (message.retention) harnessPreferences.retention = message.retention;
          if (message.glossMode) harnessPreferences.glossMode = message.glossMode;
          return { ok: true, data: { ...harnessPreferences } };
        }
        let requestPath, method = "GET", body;
        if (message.type === "ww:job:start") {
          const fingerprint = JSON.stringify({ ...message.input, retention: message.retention });
          if (!harnessRequestKeys.has(fingerprint)) harnessRequestKeys.set(fingerprint, randomUUID());
          requestPath = "/articles"; method = "POST";
          body = { ...message.input, retention: message.retention, requestKey: harnessRequestKeys.get(fingerprint) };
        } else if (message.type === "ww:job:get") requestPath = `/articles/${message.id}`;
        else if (message.type === "ww:job:retry") { requestPath = `/articles/${message.id}/retry`; method = "POST"; }
        else if (message.type === "ww:word:update") { requestPath = `/vocabulary/${message.id}`; method = "PATCH"; body = message.patch; }
        else throw new Error("Unsupported smoke bridge message");
        const response = await fetch(`${appUrl}/api/extension${requestPath}`, {
          method, headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json();
        return response.ok ? { ok: true, data } : { ok: false, error: data.error ?? "Test bridge API request failed" };
      } catch (error) { return { ok: false, error: safeLog(error.message) }; }
    });
    await context.addInitScript(() => {
      window.__wordweaveSmokeListeners = [];
      window.chrome = { runtime: {
        id: "test-content-harness",
        getURL: (value) => `chrome-extension://test-content-harness/${value}`,
        sendMessage: (message) => window.__wordweaveSmokeMessage(message),
        onMessage: { addListener: (listener) => window.__wordweaveSmokeListeners.push(listener) },
      } };
    });
  } else {
    worker = context.serviceWorkers()[0];
    if (!worker) {
      try { worker = await context.waitForEvent("serviceworker", { timeout: 15000 }); }
      catch { throw new Error("The unpacked extension did not load. Managed Chromium may prohibit unpacked extensions. Do not bypass administrator policy. Run this full smoke on a permitted local browser, or use --content-harness for explicitly limited content/API testing."); }
    }
    const extensionId = new URL(worker.url()).host;
    const optionsUrl = `chrome-extension://${extensionId}/options.html`;
    popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const options = await context.newPage();
    await options.goto(optionsUrl);
    await expect(options.locator("#server-url")).toHaveValue(/https?:/);
    await options.locator("#server-url").fill(appUrl);
    await options.locator("#access-token").fill(accessToken);
    await options.locator("#save").click();
    await expect(options.locator("#status")).toContainText("设置已保存");
    await options.locator("#test").click();
    await expect(options.locator("#status")).toContainText("连接成功");
    await options.reload();
    await expect(options.locator("#server-url")).toHaveValue(appUrl);
    report("Loaded the actual MV3 service worker; options save, connection check and reload persist configuration");
  }

  const page = await context.newPage();
  await page.goto(`${fixtureUrl}/article`);
  const originalHtml = await page.locator("article").innerHTML();
  const originalCode = await page.locator("#code").textContent();
  const originalHref = await page.locator("#original-link").getAttribute("href");
  async function openPopup() {
    await page.bringToFront();
    let popup;
    if (popupMode === "toolbar") {
      const pending = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
      const opened = await worker.evaluate(async () => { try { await chrome.action.openPopup(); return true; } catch { return false; } });
      popup = opened ? await pending : null;
      if (!popup) popupMode = "inactive-extension-tab";
    }
    if (!popup) {
      const pending = context.waitForEvent("page");
      // Opening the genuine popup document in an inactive tab keeps the fixture
      // as chrome.tabs.query's current active tab. No extension code is mocked.
      await worker.evaluate((url) => chrome.tabs.create({ url, active: false }), popupUrl);
      popup = await pending;
    }
    await popup.waitForURL(popupUrl);
    await expect(popup.locator("#page-title")).toContainText("React state updates");
    return popup;
  }
  async function openController(selection = false) {
    if (harness) {
      if (!(await page.evaluate(() => window.__wordweaveContentInstalled))) await page.addScriptTag({ path: path.join(extensionPath, "content.js") });
      await page.evaluate((scope) => {
        for (const listener of window.__wordweaveSmokeListeners) listener({ type: "ww:open", scope }, { id: chrome.runtime.id, url: chrome.runtime.getURL("popup.html") }, () => {});
      }, selection ? "selection" : "article");
    } else {
      const popup = await openPopup();
      await popup.locator(selection ? "#convert-selection" : "#convert-article").click();
      await until(() => popup.isClosed(), "popup closes after injecting content script", 5000);
    }
    await expect(page.getByRole("button", { name: "生成学习版", exact: true })).toBeVisible();
  }
  async function generate() {
    await page.getByRole("button", { name: "生成学习版", exact: true }).click();
    await expect(page.getByText("语境 · 学习版已就绪", { exact: true })).toBeVisible({ timeout: 45000 });
  }
  async function restore() {
    const collapsed = page.getByRole("button", { name: "展开", exact: true });
    if (await collapsed.isVisible()) await collapsed.click();
    await page.getByRole("button", { name: "恢复网页", exact: true }).click();
    await expect(page.locator("[data-wordweave-learning]")).toHaveCount(0);
  }
  await openController();
  assert.equal(modelRequests, 0, "Opening the learning panel must not spend a model request");
  await generate();
  assert.equal(modelRequests, 1);
  await expect(page.locator("#target [data-wordweave-learning]")).toHaveCount(1);
  if (await page.getByRole("button", { name: `查看词卡：${expression}`, exact: true }).count() !== 2) {
    console.error("Term render diagnostic:", JSON.stringify(await page.locator("#target").evaluate((node) => Array.from(node.children, (child) => child.shadowRoot?.innerHTML ?? child.outerHTML))));
    console.error("Saved paragraph diagnostic:", JSON.stringify((await database.query('SELECT "sourceId", "segments" FROM "Paragraph" ORDER BY "position"')).rows));
  }
  await expect(page.getByRole("button", { name: `查看词卡：${expression}`, exact: true })).toHaveCount(2);
  assert.equal(await page.locator("#code").textContent(), originalCode);
  await expect(page.locator("#protected code")).toHaveText("setCount((n) => n + 1)");
  await expect(page.locator("#protected a")).toHaveAttribute("href", new URL(originalHref, fixtureUrl).href);
  await expect(page.locator("#target .gloss")).toBeVisible();
  await expect(page.locator("#repeat .gloss")).toBeHidden();
  const extracted = await database.query('SELECT "sourceText" FROM "Article"');
  assert.equal(extracted.rowCount, 1);
  assert.ok(!extracted.rows[0].sourceText.includes("Hidden secret fixture"));
  assert.ok(!extracted.rows[0].sourceText.includes("Never send or rewrite this code block"));
  report(harness ? "Built content script converts in place through the real HTTP backend; inline code, links, excluded code and first-occurrence glosses are preserved" : "Popup injects the real content script; generation completes after popup closure; inline code, links, excluded code and first-occurrence glosses are preserved");

  await page.getByRole("button", { name: `查看词卡：${expression}`, exact: true }).first().click();
  const card = page.getByRole("dialog", { name: `词卡：${expression}`, exact: true });
  await expect(card).toContainText(sentence);
  await card.getByRole("button", { name: "♡ 收藏", exact: true }).click();
  await expect(card.getByRole("button", { name: "♥ 已收藏", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "想学", exact: true }).click();
  await expect(card).toContainText("当前状态：想学");
  const saved = await database.query('SELECT "favorite", "status" FROM "UserVocabulary"');
  assert.equal(saved.rowCount, 1); assert.equal(saved.rows[0].favorite, true); assert.equal(saved.rows[0].status, "LEARNING");
  await page.screenshot({ path: path.join(results, "desktop-word-card.png"), fullPage: true });
  await card.getByRole("button", { name: "关闭词卡" }).click();
  const login = await context.request.post(`${appUrl}/api/auth/login`, { data: { token: accessToken }, headers: { Origin: appUrl } });
  assert.equal(login.status(), 200, "The website must authenticate as the same owner as the extension");
  const vocabulary = await context.newPage();
  await vocabulary.goto(`${appUrl}/vocabulary`);
  await expect(vocabulary.getByText(expression, { exact: true }).first()).toBeVisible();
  await vocabulary.close();
  report("Word card saves favorite and learning state through the real API into PostgreSQL and the website vocabulary list");

  await page.getByRole("button", { name: "切换本段原文与学习版" }).first().click();
  await expect(page.locator("h1")).toContainText("React state updates");
  await page.getByRole("button", { name: "切换本段原文与学习版" }).first().click();
  await restore();
  // Chromium/Playwright screenshot cleanup may leave an empty style attribute
  // on unrelated form controls. Compare meaningful markup and node identity.
  assert.equal((await page.locator("article").innerHTML()).replaceAll(' style=""', ""), originalHtml.replaceAll(' style=""', ""));
  assert.equal(await page.evaluate(() => window.originalEventNode === document.querySelector("#event-target") && window.originalLink === document.querySelector("#original-link")), true);
  await page.locator("#event-target").click();
  await expect(page.locator("body")).toHaveAttribute("data-original-clicks", "1");
  await page.locator("#original-link").click();
  await expect(page.locator("body")).toHaveAttribute("data-link-clicked", "yes");
  report("Per-paragraph original view and full restore retain original DOM node identity and existing click handlers");

  await openController(); await generate();
  assert.equal(modelRequests, 1);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM "Article"')).rows[0].count, 1);
  await page.reload();
  await openController(); await generate();
  assert.equal(modelRequests, 1);
  await page.getByRole("button", { name: `查看词卡：${expression}`, exact: true }).first().click();
  await expect(page.getByRole("button", { name: "♥ 已收藏", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭词卡" }).click();
  report(harness ? "Backend idempotency reuses the saved job on repeated submissions and reload without another model request; favorites persist" : "Repeated conversion and page reload reuse the same saved job without another model request; favorites persist");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#target").scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.getByRole("button", { name: `查看词卡：${expression}`, exact: true }).first().click();
  await expect(card).toBeVisible();
  const bounds = await card.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391 && bounds.height <= 844 * 0.56);
  await page.screenshot({ path: path.join(results, "mobile-word-card.png"), fullPage: true });
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 2, "Opening word card must not scroll the document");
  await card.getByRole("button", { name: "关闭词卡" }).click();
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 2, "Closing word card must not scroll the document");
  report("Narrow-screen word card stays within viewport, occupies at most 55vh and preserves reading scroll position");
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const mode of ["invalid", "http-failure"]) {
    await page.goto(`${fixtureUrl}/${mode}`);
    const unchanged = await page.locator("article").innerHTML();
    modelMode = mode;
    const before = modelRequests;
    await openController();
    await page.getByRole("button", { name: "生成学习版", exact: true }).click();
    await expect(page.getByRole("button", { name: "重新生成（调用模型）", exact: true })).toBeVisible({ timeout: 45000 });
    assert.equal(modelRequests - before, 2, "Provider/JSON failures receive only one bounded automatic retry");
    assert.equal(await page.locator("article").innerHTML(), unchanged);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM "ExtensionJob" WHERE status = \'failed\'')).rows[0].count, 1);
    modelMode = "valid";
    await page.getByRole("button", { name: "重新生成（调用模型）", exact: true }).click();
    await expect(page.getByText("语境 · 学习版已就绪", { exact: true })).toBeVisible({ timeout: 45000 });
    assert.equal(modelRequests - before, 3);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM "ExtensionJob" WHERE status = \'failed\'')).rows[0].count, 0);
  }
  report("Invalid model JSON and HTTP failures leave the page unchanged; bounded automatic retries and explicit retry recover the same saved jobs");

  await page.goto(`${fixtureUrl}/selection`);
  await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector("#target")); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await openController(true); await generate();
  await expect(page.locator("[data-wordweave-learning]")).toHaveCount(1);
  await expect(page.locator("#repeat")).toHaveText(sentence);
  report("Selection mode converts only the selected paragraph and preserves the surrounding article");

  const summary = { mode: harness ? "content-harness" : "unpacked-extension", checks, modelRequests, popupMode, limitations: ["Model output is an explicit local HTTP fixture; this does not assess DeepSeek translation quality.", ...(harness ? ["The built content script uses a test-only chrome.runtime HTTP bridge. This does not validate MV3 installation, service worker lifecycle, actual popup/options UI, optional host permission prompts, activeTab, or the worker's local cache implementation."] : ["Only localhost is pre-granted in a temporary manifest copy; the native optional-permission prompt is not automated."]), ...(popupMode === "inactive-extension-tab" ? ["The genuine popup document was opened in an inactive extension tab because headless Chromium did not expose its toolbar popup."] : [])] };
  await writeFile(path.join(results, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`\n${harness ? "Content/API harness" : "Extension smoke"} passed (${checks.length} checks; popup: ${popupMode}). Screenshots and limitations: test-results/extension/.`);
} catch (error) {
  console.error(safeLog(error.stack ?? error));
  if (serverLog) console.error(`Next server tail:\n${safeLog(serverLog)}`);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await Promise.race([once(serverProcess, "exit"), delay(2500)]);
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  }
  for (const server of [modelServer, fixtureServer]) if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (database) await database.end().catch(() => {});
  if (admin) {
    // Only the name generated by this process can ever be removed.
    if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`).catch((error) => { console.error(`Temporary database cleanup failed: ${safeLog(error.message)}`); process.exitCode = 1; });
    await admin.end().catch(() => {});
  }
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
