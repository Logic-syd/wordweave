import { uiName } from "./ui-name.mjs";
/** Real production Next.js + browser-local storage; speech and mic devices are fixtures. No provider calls. */
import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const port = 3219;
const base = `http://localhost:${port}`;
const token = "practice-browser-fixture-owner-password-2026";
const shots = "test-results/practice";
let log = "",
  browser,
  server;
const errors = [];
try {
  await mkdir(shots, { recursive: true });
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: "",
        SERVER_AI_ENABLED: "false",
        NODE_ENV: "production",
        ADMIN_ACCESS_TOKEN: token,
        TRIAL_ACCESS_TOKENS: "",
        EXTENSION_ACCESS_TOKEN: "",
        LLM_API_KEY: "",
        LLM_BASE_URL: "",
        LLM_MODEL: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (data) => {
    log += data;
  });
  server.stderr.on("data", (data) => {
    log += data;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/listen`)).ok) break;
    } catch {
      /* Server starts asynchronously. */
    }
    if (i === 99 || server.exitCode !== null)
      throw new Error("Test server failed: " + log.slice(-1500));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    permissions: ["microphone"],
  });
  await context.addInitScript(() => {
    window.__speech = [];
    window.__hasVoice = false;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () =>
          window.__hasVoice
            ? [
                { lang: "en-US", name: "fixture English" },
                { lang: "de-DE", name: "fixture German" },
              ]
            : [],
        addEventListener() {},
        removeEventListener() {},
        cancel() {},
        speak(utterance) {
          window.__speech.push({ text: utterance.text, lang: utterance.lang });
          setTimeout(() => utterance.onend?.(), 25);
        },
      },
    });
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/listen`);
  await expect(
    page.getByRole("button", { name: uiName("播放这一段"), exact: true }),
  ).toBeVisible();
  await expect(page.locator(".transcript-text")).toHaveCount(0);
  assert.equal(
    (await context.request.get(`${base}/api/practice`)).status(),
    401,
  );
  await page
    .getByRole("button", { name: uiName("播放这一段"), exact: true })
    .click();
  await expect(
    page.locator(".practice-audio").getByRole("alert"),
  ).toContainText("没有可用的英语语音");
  await page.evaluate(() => {
    window.__hasVoice = true;
  });
  await page
    .getByRole("button", { name: uiName("播放这一段"), exact: true })
    .click();
  await expect.poll(() => page.evaluate(() => window.__speech.length)).toBe(1);
  assert.match(await page.evaluate(() => window.__speech[0].lang), /^en/);
  console.log(
    "PASS public practice, explicit playback, hidden transcript, missing voice, private API protection",
  );

  await page
    .getByRole("button", { name: uiName("换一段"), exact: true })
    .click();
  await page
    .getByRole("button", { name: uiName("导入自己的材料"), exact: true })
    .click();
  const importer = page.getByRole("dialog", {
    name: uiName("用自己的材料练习"),
  });
  await importer
    .getByRole("button", { name: uiName("保存并开始练习") })
    .click();
  await expect(importer.getByRole("alert")).toContainText(
    "请填写标题，并添加音频或原文",
  );
  await importer
    .getByLabel(uiName("标题"), { exact: true })
    .fill("测试：团队更新");
  await importer
    .getByLabel(/^原文/)
    .fill(
      "We batch updates to reduce work. We check the result together.\n\nThe bus stops at the station.",
    );
  await importer
    .getByRole("button", { name: uiName("保存并开始练习") })
    .click();
  await expect(importer).toHaveCount(0);
  await expect(page.locator(".practice-material-heading h2")).toHaveText(
    uiName("测试：团队更新"),
  );
  await page
    .getByLabel(uiName("我听到的重点"))
    .fill("They batch updates and check the result together.");
  await page.getByLabel(uiName("朗读语速")).selectOption("0.65");
  await expect(page.locator(".practice-bottom")).toContainText(
    "已保存在这个浏览器",
  );
  await page.reload();
  await expect(page.getByLabel(uiName("我听到的重点"))).toHaveValue(
    "They batch updates and check the result together.",
  );
  await expect(page.getByLabel(uiName("朗读语速"))).toHaveValue("0.65");
  await page.getByText(uiName("换个练法"), { exact: true }).click();
  await page
    .getByRole("button", { name: uiName("逐句听写"), exact: true })
    .click();
  await page
    .getByLabel(uiName("把听到的这句写下来"))
    .fill("We batch updates to reduce work.");
  await page
    .getByRole("button", { name: uiName("保存并对照听写"), exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: uiName("本次练习反馈") }),
  ).toContainText("100%");
  await page.getByText(uiName("换个练法"), { exact: true }).click();
  await page
    .getByRole("button", { name: uiName("听懂大意"), exact: true })
    .click();
  await expect(page.getByLabel(uiName("我听到的重点"))).toHaveValue(
    "They batch updates and check the result together.",
  );
  await page.screenshot({
    path: `${shots}/listen-desktop.png`,
    fullPage: true,
  });
  console.log(
    "PASS import validation, paragraph material, persisted answers/speed, separate task drafts, real dictation comparison",
  );

  await page
    .getByRole("button", { name: uiName("收藏表达"), exact: true })
    .click();
  await page.getByLabel(uiName("原文表达")).fill("batch");
  await page.getByLabel(uiName("在这里的中文意思")).fill("批量处理");
  await page
    .getByRole("button", { name: uiName("收藏到共用单词库"), exact: true })
    .click();
  let card = page.getByRole("dialog", { name: "batch", exact: true });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: uiName("认识"), exact: true }).click();
  await expect(
    card.getByRole("button", { name: uiName("认识"), exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: uiName("关闭词卡") }).click();
  await page
    .getByRole("navigation", { name: uiName("听说读导航") })
    .getByRole("link", { name: uiName("口语"), exact: true })
    .click();
  await page.getByLabel(uiName("更多功能")).click();
  await page
    .getByRole("link", { name: uiName("复述与录音"), exact: true })
    .click();
  await page
    .getByRole("button", { name: uiName("换一段"), exact: true })
    .click();
  await page
    .getByRole("link", { name: uiName("说 batch"), exact: true })
    .click();
  await expect(page.locator(".practice-material-heading h2")).toHaveText(
    uiName("练一句 · batch"),
  );
  await page
    .getByRole("button", { name: uiName("收藏表达"), exact: true })
    .click();
  await page
    .getByRole("button", { name: uiName("收藏到共用单词库"), exact: true })
    .click();
  card = page.getByRole("dialog", { name: "batch", exact: true });
  await expect(
    card.getByRole("button", { name: uiName("认识"), exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: uiName("关闭词卡") }).click();
  await page
    .getByRole("button", { name: uiName("录下我的回答"), exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: uiName("停止录音"), exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: uiName("停止录音"), exact: true })
    .click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  await page.screenshot({ path: `${shots}/speak-desktop.png`, fullPage: true });
  await page.getByLabel(uiName("更多功能"), { exact: true }).click();
  await page
    .locator(".platform-menu")
    .getByRole("link", { name: uiName("单词库"), exact: true })
    .click();
  await expect(page.locator(".vocabulary-row")).toHaveCount(1);
  await expect(page.locator(".vocabulary-row")).toContainText("听力");
  await expect(page.locator(".vocabulary-row")).toContainText("口语");
  await expect(page.locator(".vocabulary-row")).toContainText("认识");
  await page.getByLabel(uiName("词条来源筛选")).selectOption("speak");
  await expect(page.locator(".vocabulary-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".vocabulary-row")).toHaveCount(1);
  await page.screenshot({
    path: `${shots}/vocabulary-desktop.png`,
    fullPage: true,
  });
  console.log(
    "PASS shared vocabulary, same word ID and known state, source filters, recording with a fake mic, refresh persistence",
  );

  // Mobile: no horizontal scroll; the word card restores the same viewport when closed.
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("link", { name: uiName("听这个词"), exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: uiName("播放这一段"), exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `${shots}/listen-mobile.png`, fullPage: true });
  await page
    .getByRole("button", { name: uiName("换一段"), exact: true })
    .click();
  await page
    .locator(".practice-shelf-word > button")
    .first()
    .scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await page.locator(".practice-shelf-word > button").first().click();
  await expect(
    page.getByRole("dialog", { name: "batch", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${shots}/word-card-mobile.png` });
  await page.getByRole("button", { name: uiName("关闭词卡") }).click();
  assert.ok(Math.abs((await page.evaluate(() => scrollY)) - scroll) < 4);
  await page
    .getByLabel(uiName("我听到的重点"))
    .fill("Resume my word-based listening exercise.");
  await expect(page.locator(".practice-bottom")).toContainText(
    "已保存在这个浏览器",
  );
  const wordExercise = page.url();
  await page.goto(`${base}/listen`);
  await expect(page.getByRole("region", { name: "每日精选" })).toBeVisible();
  await page.goto(wordExercise);
  await expect(page.locator(".practice-material-heading h2")).toHaveText(
    uiName("练一句 · batch"),
  );
  await expect(page.getByLabel(uiName("我听到的重点"))).toHaveValue(
    "Resume my word-based listening exercise.",
  );
  await page
    .getByRole("button", { name: uiName("换一段"), exact: true })
    .click();
  await page
    .locator(".material-options button")
    .filter({ hasText: "解释一个技术取舍" })
    .click();
  await page.reload();
  await expect(page.locator(".practice-material-heading h2")).toHaveText(
    uiName("解释一个技术取舍"),
  );
  console.log(
    "PASS daily listening on the plain URL; explicit word/material links resume after reload",
  );
  await page.goto(`${base}/read`);
  await expect(page.locator(".reading-content")).toBeVisible();
  await page
    .getByRole("navigation", { name: uiName("听说读导航") })
    .getByRole("link", { name: uiName("阅读"), exact: true })
    .getAttribute("aria-current")
    .then((value) => assert.equal(value, "page"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `${shots}/read-mobile.png`, fullPage: true });
  await page.goto(base);
  await expect(page).toHaveURL(base + "/");
  await expect(page.locator(".reading-content")).toBeVisible();
  await expect(page.locator(".skill-entrance")).toHaveCount(0);
  await page.screenshot({ path: `${shots}/home-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${shots}/home-desktop.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS three page navigation, mobile layout, word card scroll restoration, zero browser runtime errors",
  );
} catch (error) {
  console.error("Practice browser test failed:", error);
  console.error(log.slice(-2200));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 5000).unref();
    });
  }
}
