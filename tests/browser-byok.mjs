import { uiName } from "./ui-name.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const calls = [],
  siteRequests = [],
  browserErrors = [];
let failure = "",
  serverLog = "",
  app,
  browser;
const userKey = "byok-fixture-user-secret",
  siteKey = "server-key-must-never-be-used";
const provider = createServer(async (req, res) => {
  if (failure !== "cors") res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  calls.push({
    authorization: req.headers.authorization,
    body,
    origin: req.headers.origin,
  });
  if (failure === "http") {
    res
      .writeHead(401, { "Content-Type": "application/json" })
      .end(JSON.stringify({ error: { message: "Do not echo credential" } }));
    return;
  }
  const system = body.messages[0].content,
    input = JSON.parse(body.messages[1].content);
  let value;
  if (input.task === "connection check") value = { ok: true };
  else if (input.data?.settings && !input.data.paragraphs) {
    const fresh = input.data.settings.reviewOnly
      ? []
      : [
          {
            lemma: "Apfel",
            meaning: "苹果",
            grammar: { article: "der", plural: "die Äpfel" },
          },
          {
            lemma: "Brot",
            meaning: "面包",
            grammar: { article: "das", plural: "die Brote" },
          },
          {
            lemma: "Tasche",
            meaning: "袋子",
            grammar: { article: "die", plural: "die Taschen" },
          },
        ];
    const terms = [
      ...fresh,
      ...input.data.reviewTargets.map((w) => ({
        ...w,
        reviewVocabularyId: w.id,
      })),
    ].map((w, i) => ({
      ...w,
      id: `g${i}`,
      partOfSpeech: "noun",
      explanation: "购物时用到的名词。",
      example: `Hier ist ${w.grammar.article} ${w.lemma}.`,
      exampleTranslation: `这里是${w.meaning}。`,
    }));
    value = {
      title: "模拟接口：购物练习",
      terms,
      paragraphs: terms.map((w, i) => ({
        id: `p${String(i + 1).padStart(4, "0")}`,
        original: w.example,
        segments: [
          { type: "text", text: "购物时，我看到了 " },
          {
            type: "term",
            text: w.lemma,
            termId: w.id,
            meaning: w.meaning,
            sentence: w.example,
          },
          { type: "text", text: "，继续选购需要的东西。" },
        ],
      })),
    };
  } else if (input.data) {
    const paragraphs = input.data.paragraphs ?? [];
    value = {
      title: "React 状态更新",
      terms: paragraphs.some((p) => p.kind !== "heading")
        ? [
            {
              id: "phrase",
              lemma: "avoid unnecessary re-renders",
              partOfSpeech: "phrase",
              meaning: "避免不必要的重新渲染",
              grammar: {},
              explanation: "表示避免额外的渲染工作。",
              example:
                "React batches state updates to avoid unnecessary re-renders.",
              exampleTranslation:
                "React 会批量处理状态更新，避免不必要的重新渲染。",
              category: "general",
            },
          ]
        : [],
      paragraphs: paragraphs.map((p) => ({
        id: p.id,
        segments:
          p.kind === "heading"
            ? [{ type: "text", text: "# 状态更新" }]
            : [
                { type: "text", text: "React 会批量处理状态更新，以 " },
                {
                  type: "term",
                  text: "avoid unnecessary re-renders",
                  termId: "phrase",
                  meaning: "避免不必要的重新渲染",
                  sentence:
                    "React batches state updates to avoid unnecessary re-renders.",
                },
                {
                  type: "text",
                  text: "。使用 " + (p.protectedTokens ?? []).join(" ") + "。",
                },
              ],
      })),
    };
    assert.equal(
      raw.includes('const untouched = "<safe>";'),
      false,
      "code block reached the model",
    );
    assert.equal(
      raw.includes("setCount(n => n + 1)"),
      false,
      "inline code was not protected",
    );
  } else if (system.includes("Evaluate only the written answer"))
    value = {
      points: [
        {
          label: "回答了重点",
          status: "met",
          explanation: "提到了更新与重新渲染。",
        },
      ],
      correction: "",
      example: "We batch updates to avoid extra renders.",
      review: [],
    };
  else
    value = {
      paragraphs: input.paragraphs.map((p) => ({
        index: p.index,
        zh: "这是中文参考。",
        question: "What happens?",
        answerGuide: "说明发生的事情。",
        oral: "Describe a similar situation.",
        points: ["说明发生的事情。"],
      })),
    };
  await new Promise((resolve) => setTimeout(resolve, 120));
  res.writeHead(200, { "Content-Type": "application/json" }).end(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: failure === "json" ? "not json" : JSON.stringify(value),
          },
        },
      ],
    }),
  );
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerBase = `http://127.0.0.1:${provider.address().port}/v1`;
const base = "http://localhost:3220",
  shots = "test-results/browser-byok";
try {
  await mkdir(shots, { recursive: true });
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3220",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "",
        ADMIN_ACCESS_TOKEN: "public-test-owner-credential-1234567890",
        TRIAL_ACCESS_TOKENS: "",
        EXTENSION_ACCESS_TOKEN: "",
        SERVER_AI_ENABLED: "false",
        LLM_API_KEY: siteKey,
        LLM_BASE_URL: providerBase,
        LLM_MODEL: "server-model",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  app.stdout.on("data", (c) => {
    serverLog += c;
  });
  app.stderr.on("data", (c) => {
    serverLog += c;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/listen")).ok) break;
    } catch {}
    if (i === 99) throw new Error("startup failed " + serverLog.slice(-1000));
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      viewport: { width: 1360, height: 1000 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("request", (req) => {
    if (req.url().startsWith(base + "/api/"))
      siteRequests.push({
        url: req.url(),
        method: req.method(),
        body: req.postData(),
      });
  });
  await page.goto(base + "/listen");
  assert.deepEqual(await (await fetch(base + "/api/health")).json(), {
    status: "ok",
    storage: "browser",
  });
  await expect(
    page.getByRole("button", { name: uiName("播放这一段"), exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: uiName("登录") })).toHaveCount(0);
  await page.goto(base + "/");
  await page
    .getByRole("button", { name: uiName("只导入原文（免费）") })
    .click();
  await page
    .getByLabel(uiName("文章标题"), { exact: true })
    .fill("我的本地文章");
  const code = 'const untouched = "<safe>";';
  const source =
    "# State updates\n\nReact batches state updates to avoid unnecessary re-renders. Use `setCount(n => n + 1)`.\n\n```tsx\n" +
    code +
    "\n```";
  await page.getByLabel(uiName("英文正文"), { exact: true }).fill(source);
  await page
    .getByRole("button", { name: uiName("保存原文"), exact: true })
    .click();
  await page.waitForURL(/\/read\/local-article-/);
  const articleUrl = page.url();
  await expect(page.locator("pre")).toContainText(code);
  assert.equal(calls.length, 0);
  console.log(
    "PASS no registration/key: public practice and local Markdown import; no provider requests",
  );

  await page.goto(base + "/settings");
  await page.getByLabel(uiName("AI 服务商")).selectOption("custom");
  await page.getByLabel(uiName("API 地址（Base URL）")).fill(providerBase);
  await page.getByLabel(uiName("模型名称")).fill("user-model");
  await page.getByLabel(uiName("自己的 API Key")).fill(userKey);
  await page.getByText(uiName("存储与高级设置"), { exact: true }).click();
  await page.getByRole("checkbox", { name: /在这个浏览器记住 Key/ }).check();
  await page
    .getByRole("button", { name: uiName("保存配置"), exact: true })
    .click();
  assert.equal(calls.length, 0);
  await page
    .getByRole("button", { name: uiName("测试连接（使用少量额度）") })
    .click();
  await expect(page.getByRole("status")).toContainText("连接成功");
  await page.goto(articleUrl);
  await page
    .getByRole("button", { name: uiName("生成设置"), exact: true })
    .click();
  await page
    .getByRole("button", { name: uiName("明确重新生成"), exact: true })
    .click();
  await expect(
    page
      .getByRole("button", {
        name: uiName("查看词卡：avoid unnecessary re-renders"),
        exact: true,
      })
      .first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator("pre")).toContainText(code);
  await expect(page.locator(".reading-content")).toContainText(
    "setCount(n => n + 1)",
  );
  await page.locator("#p0002 .original-details summary").click();
  await expect(page.locator("#p0002 .original-details")).toContainText(
    "React batches state updates",
  );
  await page
    .getByRole("button", {
      name: uiName("查看词卡：avoid unnecessary re-renders"),
      exact: true,
    })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: uiName("收藏到生词本"), exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: uiName("已收藏"), exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: uiName("关闭词卡") }).click();
  await page.getByLabel(uiName("释义显示方式")).selectOption("click");
  await page.reload();
  await expect(page.getByLabel(uiName("释义显示方式"))).toHaveValue("click");
  const beforeFailure = calls.length;
  failure = "json";
  await page
    .getByRole("button", { name: uiName("生成设置"), exact: true })
    .click();
  await page
    .getByRole("button", { name: uiName("明确重新生成"), exact: true })
    .click();
  await expect(page.locator(".reader-error")).toBeVisible({ timeout: 15000 });
  await expect(
    page
      .getByRole("button", {
        name: uiName("查看词卡：avoid unnecessary re-renders"),
        exact: true,
      })
      .first(),
  ).toBeVisible();
  assert.equal(calls.length - beforeFailure, 2);
  failure = "";
  for (const kind of ["http", "cors"]) {
    const before = calls.length;
    failure = kind;
    await page
      .getByRole("button", { name: uiName("明确重新生成"), exact: true })
      .click();
    await expect(page.locator(".reader-error")).toContainText(
      kind === "http" ? "Key" : "CORS",
      { timeout: 10000 },
    );
    assert.ok(
      calls.length - before <= 1,
      "Authentication/CORS errors must not repeat calls",
    );
    await expect(page.locator(".reader-error")).not.toContainText(
      "Do not echo credential",
    );
    if (kind === "http") {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator(".inbox-body")).not.toBeVisible();
      await page
        .getByRole("button", { name: uiName("检查设置并重试") })
        .click();
      await expect(page.locator(".reader-settings")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "导入文章与阅读设置", exact: true }),
      ).toHaveAttribute("aria-expanded", "true");
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await expect(
      page
        .getByRole("button", {
          name: uiName("查看词卡：avoid unnecessary re-renders"),
          exact: true,
        })
        .first(),
    ).toBeVisible();
  }
  failure = "";
  console.log(
    "PASS direct BYOK generation, protected code, source correspondence, favorites/preferences, bounded invalid-output retry preserving successful version",
  );

  await page.goto(base + "/vocabulary");
  await expect(page.locator(".vocabulary-row")).toHaveCount(1);
  await page
    .getByRole("link", { name: uiName("听这个词"), exact: true })
    .click();
  await expect(page.locator(".practice-material-heading")).toContainText(
    "avoid unnecessary re-renders",
  );
  await page
    .getByLabel(uiName("我听到的重点"))
    .fill("React batches state updates.");
  await page
    .getByRole("button", { name: uiName("保存并获取 AI 反馈"), exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: uiName("本次练习反馈") }),
  ).toContainText("本次文字回答的 AI 反馈");
  await page
    .getByRole("button", { name: uiName("收藏表达"), exact: true })
    .click();
  await page
    .getByRole("button", { name: uiName("收藏到共用单词库"), exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: uiName("关闭词卡") }).click();
  await page.getByRole("link", { name: uiName("这段也拿来说") }).click();
  await page.getByText(uiName("换个练法"), { exact: true }).click();
  await page.getByRole("button", { name: uiName("复述"), exact: true }).click();
  await page
    .getByLabel(uiName("记下我刚才说的话"))
    .fill("React batches updates to avoid extra renders.");
  await page
    .getByRole("button", { name: uiName("保存并获取 AI 反馈"), exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: uiName("本次练习反馈") }),
  ).toContainText("本次文字回答的 AI 反馈");
  await page.reload();
  await expect(page.getByLabel(uiName("记下我刚才说的话"))).toHaveValue(
    "React batches updates to avoid extra renders.",
  );
  await page.goto(base + "/vocabulary");
  await expect(page.locator(".vocabulary-row")).toHaveCount(1);
  await expect(page.locator(".vocabulary-row")).toContainText("听力");
  await expect(page.locator(".vocabulary-row")).toContainText("阅读");
  console.log(
    "PASS browser-local shared words, direct listening/speaking feedback and saved practice across refresh",
  );

  const other = await browser.newContext(),
    otherPage = await other.newPage();
  await otherPage.goto(base + "/vocabulary");
  await expect(
    otherPage.getByText(uiName("这里还没有符合条件的词"), { exact: true }),
  ).toBeVisible();
  await otherPage.goto(base + "/settings");
  await expect(otherPage.getByLabel(uiName("自己的 API Key"))).toHaveValue("");
  await otherPage.goto(articleUrl);
  await expect(otherPage.locator(".practice-notice")).toContainText(
    "这个浏览器里没有这篇文章",
  );
  await other.close();
  assert.ok(
    calls.every(
      (c) =>
        c.authorization === `Bearer ${userKey}` &&
        c.body.model === "user-model" &&
        c.origin === base,
    ),
  );
  assert.equal(siteRequests.length, 0, JSON.stringify(siteRequests));
  assert.deepEqual(browserErrors, []);
  console.log(
    "PASS separate browsers cannot see each other's articles, words or Key; zero site API calls; server sentinel Key never used",
  );

  for (const path of [
    "/api/articles/fake/generate",
    "/api/practice/ai/grade",
    "/api/extension/articles",
    "/api/extension/articles/fake/retry",
  ]) {
    const r = await fetch(base + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer public-test-owner-credential-1234567890",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(r.status, 403, path);
  }
  await page.goto(base + "/new?mode=german");
  await page.getByLabel(uiName("每篇新词")).selectOption("3");
  await page
    .getByRole("button", { name: uiName("生成我的故事"), exact: true })
    .click();
  await page.waitForURL(/\/read\/local-article-/);
  await expect(
    page.getByRole("button", { name: uiName("查看词卡：Apfel"), exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByText(uiName("本篇词汇覆盖"), { exact: true }).click();
  await expect(page.locator(".coverage-panel")).toContainText(
    "新词 3 / 目标 3",
  );
  await page
    .getByRole("button", { name: uiName("查看词卡：Apfel"), exact: true })
    .click();
  await page
    .getByRole("button", { name: uiName("收藏到生词本"), exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: uiName("已收藏"), exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: uiName("关闭词卡") }).click();
  await page.goto(base + "/new?mode=german");
  await page
    .getByRole("checkbox", { name: uiName("只复习，不加新词") })
    .check();
  await page
    .getByRole("button", { name: uiName("生成我的故事"), exact: true })
    .click();
  await page.waitForURL(/\/read\/local-article-/);
  await expect(
    page.getByRole("button", { name: uiName("查看词卡：Apfel"), exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByText(uiName("本篇词汇覆盖"), { exact: true }).click();
  await expect(page.locator(".coverage-panel")).toContainText(
    "新词 0 / 目标 0",
  );
  await expect(page.locator(".coverage-panel")).toContainText(
    "复习 1 / 待复习目标 1",
  );
  console.log(
    "PASS German BYOK new-word target and review-only coverage from shared browser vocabulary",
  );
  await page.goto(base + "/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: uiName("导出学习记录（不含 Key）") })
    .click();
  const file = await download,
    stream = await file.createReadStream();
  let exported = "";
  for await (const part of stream) exported += part;
  assert.equal(exported.includes(userKey), false);
  assert.ok(exported.includes("我的本地文章"));
  await page
    .getByRole("button", { name: uiName("移除 Key"), exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel(uiName("自己的 API Key"))).toHaveValue("");
  await page.goto(base + "/vocabulary");
  await expect(page.locator(".vocabulary-row")).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/listen");
  await expect(
    page.getByRole("button", { name: uiName("播放这一段"), exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: shots + "/public-listen-mobile.png",
    fullPage: true,
  });
  await page.goto(base + "/settings");
  await page.screenshot({
    path: shots + "/api-settings-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto(base);
  await page.screenshot({ path: shots + "/public-home.png", fullPage: true });
  console.log(
    "PASS owner-funded endpoints disabled even with valid owner auth, Key-free export/removal, mobile layout",
  );
} catch (e) {
  console.error(e);
  console.error(serverLog.slice(-1200));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (app?.exitCode === null) {
    app.kill("SIGTERM");
    await new Promise((r) => {
      app.once("exit", r);
      setTimeout(r, 4000).unref();
    });
  }
  await new Promise((r) => provider.close(r));
}
