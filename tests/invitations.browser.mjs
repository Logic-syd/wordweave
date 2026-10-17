/**
 * Real invitation/login React components in Chromium with explicit local API
 * fixtures. These checks do not use Next.js routing, a database, or real tokens.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "wordweave-invitations-"));
const screenshots = join(repository, "test-results", "invitations");
const fixtureToken = `fixture-only-${"a".repeat(52)}`;
const rotatedToken = `fixture-only-${"b".repeat(52)}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invitation(overrides = {}) {
  return {
    id: "invitation-fixture-1",
    ownerId: "friend_fixture",
    label: "给安娜的周末试用",
    active: true,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

let browser;
let server;
let passed = 0;
const contexts = new Set();

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
        import { Invitations } from "./src/app/invites/invitations";
        import { LoginForm } from "./src/app/login/login-form";
        import loginStyles from "./src/app/login/login.module.css";
        const root = createRoot(document.getElementById("fixture-root"));
        if (window.location.pathname === "/login") {
          root.render(createElement("main", {className: loginStyles.page},
            createElement("section", {className: loginStyles.card},
              createElement("h1", null, "进入学习空间"), createElement(LoginForm))));
        } else if (window.location.pathname === "/invites") {
          root.render(createElement(Invitations));
        } else {
          root.render(createElement("h1", null, "已进入测试学习空间"));
        }
      `,
    },
    outfile: join(temporary, "fixture.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{
      name: "next-component-fixtures",
      setup(bundler) {
        bundler.onResolve({ filter: /^next\/(navigation|link)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
        bundler.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents: path === "next/link"
            ? 'import { createElement } from "react"; export default function Link(props) { return createElement("a", props); }'
            : 'export function useSearchParams() { return new URLSearchParams(window.location.search); } export function usePathname() { return window.location.pathname; } export function useRouter() { return {push: (path) => window.location.assign(path), replace: (path) => window.location.replace(path), refresh: () => window.location.reload()}; }',
          resolveDir: repository,
          loader: "js",
        }));
      },
    }],
  });
  const globalsPath = join(repository, "src/app/globals.css");
  const globals = await postcss([tailwindcss()]).process(await readFile(globalsPath, "utf8"), { from: globalsPath });
  const [script, modules] = await Promise.all([
    readFile(join(temporary, "fixture.js")),
    readFile(join(temporary, "fixture.css"), "utf8"),
  ]);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitation component fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><aside style="padding:10px 18px;background:#f5e5eb;color:#714253;font-size:12px">组件浏览器测试夹具 · 模拟邀请接口 · 所有邀请码均为测试值</aside><div id="fixture-root"></div><script src="/fixture.js"></script></body></html>`;
  server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const [contentType, body] = pathname === "/fixture.js"
      ? ["text/javascript", script]
      : pathname === "/fixture.css"
        ? ["text/css", globals.css + modules]
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

  async function fixture(path = "/invites", overrides = {}) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    contexts.add(context);
    const page = await context.newPage();
    const state = {
      invitations: [],
      authenticated: false,
      holdSession: false,
      holdCreate: false,
      failAfterCreate: false,
      sessionGets: 0,
      createBodies: [],
      patchBodies: [],
      loginBodies: [],
      requestURLs: [],
      errors: [],
      releaseCreate: () => {},
      releaseSession: () => {},
      ...overrides,
    };
    const creations = new Map();
    page.on("pageerror", (error) => state.errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      state.requestURLs.push(request.url());
      if (url.origin !== baseURL) return route.abort();
      if (url.pathname === "/api/auth/session") {
        state.sessionGets++;
        if (state.holdSession) await new Promise((release) => { state.releaseSession = release; });
        return route.fulfill({ json: {
          authenticated: state.authenticated,
          ownerId: state.authenticated ? "existing_fixture_space" : undefined,
          configured: true,
          enabled: true,
        } });
      }
      if (url.pathname === "/api/auth/login") {
        assert.equal(request.method(), "POST");
        state.loginBodies.push(request.postDataJSON());
        return route.fulfill({ json: { ok: true, ownerId: "friend_fixture" } });
      }
      if (url.pathname === "/api/invitations" && request.method() === "GET") {
        return route.fulfill({ json: { invitations: state.invitations, legacyInvitationsManaged: false } });
      }
      if (url.pathname === "/api/invitations" && request.method() === "POST") {
        const body = request.postDataJSON();
        state.createBodies.push(body);
        assert.match(body.requestKey, uuidPattern);
        const replayed = creations.has(body.requestKey);
        const saved = creations.get(body.requestKey) || invitation({ label: body.label });
        if (!replayed) {
          creations.set(body.requestKey, saved);
          state.invitations.push(saved);
        }
        if (state.holdCreate) await new Promise((release) => { state.releaseCreate = release; });
        if (state.failAfterCreate && !replayed) return route.abort("failed");
        return route.fulfill({ json: { invitation: saved, token: replayed ? null : fixtureToken, replayed } });
      }
      if (url.pathname.startsWith("/api/invitations/") && request.method() === "PATCH") {
        const body = request.postDataJSON();
        state.patchBodies.push(body);
        assert.match(body.requestKey, uuidPattern);
        assert.ok(["revoke", "rotate"].includes(body.action));
        const id = url.pathname.split("/").at(-1);
        const index = state.invitations.findIndex((item) => item.id === id);
        assert.ok(index >= 0);
        state.invitations[index] = {
          ...state.invitations[index],
          active: body.action === "rotate",
          revokedAt: body.action === "revoke" ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        };
        return route.fulfill({ json: {
          invitation: state.invitations[index],
          token: body.action === "rotate" ? rotatedToken : null,
          replayed: false,
        } });
      }
      return route.continue();
    });
    await page.goto(baseURL + path);
    return { page, state };
  }

  async function check(name, action) {
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

  await check("creating one invitation preserves its note, copies a fragment link, and hides the token after reload", async () => {
    const { page, state } = await fixture("/invites", { holdCreate: true });
    await page.getByLabel("给自己看的备注", { exact: false }).fill("给安娜的周末试用");
    await page.getByRole("button", { name: "生成邀请码", exact: true }).click();
    await expect(page.getByRole("button", { name: "正在准备…", exact: true })).toBeDisabled();
    await expect.poll(() => state.createBodies.length).toBe(1);
    assert.equal(state.createBodies[0].label, "给安娜的周末试用");
    state.releaseCreate();
    await expect(page.getByLabel("邀请码", { exact: true })).toHaveValue(fixtureToken);
    const inviteLink = await page.getByLabel("邀请链接", { exact: true }).inputValue();
    const parsed = new URL(inviteLink);
    assert.equal(parsed.origin, baseURL);
    assert.equal(parsed.pathname, "/login");
    assert.equal(parsed.search, "");
    assert.equal(new URLSearchParams(parsed.hash.slice(1)).get("invite"), fixtureToken);

    await page.getByRole("button", { name: "复制邀请链接", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), inviteLink);
    await page.getByRole("button", { name: "复制邀请码", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixtureToken);
    assert.equal(state.createBodies.length, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Mobile invitation controls must not overflow horizontally");
    await page.screenshot({ path: join(screenshots, "mobile-invitation.png"), fullPage: true });

    await page.reload();
    await expect(page.getByRole("heading", { name: "给安娜的周末试用", exact: true })).toBeVisible();
    await expect(page.getByLabel("邀请码", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "复制邀请码", exact: true })).toHaveCount(0);
    assert.equal(state.createBodies.length, 1, "Reloading metadata must not create or reissue an invitation");
    assert.ok(state.requestURLs.every((url) => !url.includes(fixtureToken)));
    assert.deepEqual(state.errors, []);
  });

  await check("revocation and rotation require explicit confirmation and cancellation performs no mutation", async () => {
    const { page, state } = await fixture("/invites", { invitations: [invitation()] });
    await expect(page.getByRole("heading", { name: "给安娜的周末试用", exact: true })).toBeVisible();
    await expect(page.getByLabel("邀请码", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    const revoke = page.getByRole("group", { name: "确认撤销邀请", exact: true });
    await expect(revoke).toBeVisible();
    assert.equal(state.patchBodies.length, 0);
    await revoke.getByRole("button", { name: "取消", exact: true }).click();
    await expect(revoke).toHaveCount(0);
    assert.equal(state.patchBodies.length, 0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await revoke.getByRole("button", { name: "确认撤销", exact: true }).click();
    await expect(page.getByText("已撤销", { exact: true })).toBeVisible();
    assert.equal(state.patchBodies.length, 1);
    assert.equal(state.patchBodies[0].action, "revoke");

    await page.getByRole("button", { name: "重新生成邀请码", exact: true }).click();
    const rotate = page.getByRole("group", { name: "确认重新生成邀请码", exact: true });
    await expect(rotate).toBeVisible();
    assert.equal(state.patchBodies.length, 1);
    await rotate.getByRole("button", { name: "取消", exact: true }).click();
    await expect(rotate).toHaveCount(0);
    assert.equal(state.patchBodies.length, 1);
    await page.getByRole("button", { name: "重新生成邀请码", exact: true }).click();
    await rotate.getByRole("button", { name: "确认重新生成", exact: true }).click();
    await expect(page.getByLabel("邀请码", { exact: true })).toHaveValue(rotatedToken);
    await expect(page.getByText("有效", { exact: true })).toBeVisible();
    assert.equal(state.patchBodies.length, 2);
    assert.equal(state.patchBodies[1].action, "rotate");
    assert.notEqual(state.patchBodies[0].requestKey, state.patchBodies[1].requestKey);
    assert.deepEqual(state.errors, []);
  });

  await check("a lost create response retries the same request key and explains one-time token recovery", async () => {
    const { page, state } = await fixture("/invites", { failAfterCreate: true });
    await page.getByLabel("给自己看的备注", { exact: false }).fill("断线恢复测试");
    await page.getByRole("button", { name: "生成邀请码", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("操作可能已经完成");
    const originalKey = state.createBodies[0].requestKey;
    await expect(page.getByLabel("给自己看的备注", { exact: false })).toBeDisabled();
    await page.getByRole("button", { name: "检查上次生成结果", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("邀请码只显示一次");
    await expect(page.getByRole("status")).toContainText("重新生成邀请码");
    assert.equal(state.createBodies.length, 2);
    assert.equal(state.createBodies[1].requestKey, originalKey);
    assert.equal(state.invitations.length, 1);
    await expect(page.getByRole("heading", { name: "断线恢复测试", exact: true })).toBeVisible();
    await expect(page.getByLabel("邀请码", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "重新生成邀请码", exact: true }).click();
    await page.getByRole("button", { name: "确认重新生成", exact: true }).click();
    await expect(page.getByLabel("邀请码", { exact: true })).toHaveValue(rotatedToken);
    assert.equal(state.patchBodies[0].action, "rotate");
    assert.deepEqual(state.errors, []);
  });

  for (const authenticated of [false, true]) {
    await check(`a fragment invitation is cleared and prefilled without automatic login (${authenticated ? "existing session" : "new visitor"})`, async () => {
      const path = `/login?next=${encodeURIComponent("/library?mode=german")}#invite=${encodeURIComponent(fixtureToken)}`;
      const { page, state } = await fixture(path, { authenticated, holdSession: true });
      await expect.poll(() => new URL(page.url()).hash).toBe("");
      await expect.poll(() => state.sessionGets).toBe(1);
      assert.equal(state.loginBodies.length, 0);
      assert.equal(new URL(page.url()).searchParams.get("next"), "/library?mode=german");
      state.releaseSession();
      await expect(page.getByLabel("邀请码", { exact: true })).toHaveValue(fixtureToken);
      assert.equal(state.loginBodies.length, 0, "Opening an invitation must not change the active session without a click");
      if (authenticated) await expect(page.getByText(/已登录/)).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await page.screenshot({ path: join(screenshots, authenticated ? "mobile-switch-space.png" : "mobile-login.png"), fullPage: true });
      await page.getByRole("button", { name: "进入学习空间", exact: true }).click();
      await page.waitForURL(`${baseURL}/library?mode=german`);
      assert.deepEqual(state.loginBodies, [{ token: fixtureToken }]);
      assert.ok(state.requestURLs.every((url) => !url.includes(fixtureToken)), "Invitation values must never enter an HTTP request URL");
      assert.deepEqual(state.errors, []);
    });
  }

  console.log(`\n${passed} invitation/login browser component checks passed. APIs and tokens are fixtures; no Next server or database was used.`);
  console.log(`Screenshots: ${screenshots}`);
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(temporary, { recursive: true, force: true });
}
