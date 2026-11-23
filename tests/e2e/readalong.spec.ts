import { uiName } from "../ui-name.mjs";
import { type Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function selectText(page: Page, text: string) {
  await page
    .locator(".sentence-content")
    .first()
    .evaluate((element, value) => {
      const node = element.firstChild!;
      const offset = node.textContent!.indexOf(value);
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + value.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }, text);
  await page.locator("#sentences").dispatchEvent("mouseup");
}

test("original design, imported sentences, expanded playback and position survive reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          { lang: "en-US", name: "Test voice", voiceURI: "test" },
        ],
        speak: () => {},
        cancel: () => {},
        addEventListener: () => {},
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/speak");
  await expect(
    page.getByRole("heading", { name: uiName("文章收件箱") }),
  ).toBeVisible();
  await expect(page.locator("#sentences .sentence")).toHaveCount(5);
  await expect(page.locator("#vocabulary")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/readalong-restored-desktop.png",
    fullPage: true,
  });
  const source = Array.from(
    { length: 60 },
    (_, i) =>
      `Sentence ${i + 1} keeps its original condition, meaning and punctuation.`,
  ).join("\n");
  await page.locator("#text-file").setInputFiles({
    name: "Long article.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await expect(page.locator("#text")).toHaveValue(source);
  await page.locator("#generate").click();
  await expect(page.locator(".sentence")).toHaveCount(60);
  await expect(page.locator("#save-lesson")).toHaveText(
    "已保存到我的库 / Saved",
  );
  await page.locator("#play").click();
  await expect(page.locator("body")).toHaveClass(/\breading-focus\b/);
  await expect(page.locator("#status")).toContainText("正在听");
  const pane = await page.locator("#sentences").boundingBox();
  expect(pane!.width).toBeGreaterThan(1100);
  expect(pane!.height).toBeGreaterThan(550);
  await page.locator("#play").click();
  await expect(page.locator("body")).toHaveClass(/\breading-focus\b/);
  for (let i = 0; i < 18; i++) await page.locator("#next").click();
  await expect(page.locator(".sentence.active")).toContainText("Sentence 19");
  await page.reload();
  await expect(page.locator(".sentence.active")).toContainText("Sentence 19");
  await expect(page.locator(".sentence.active")).toBeInViewport();
  await expect(page.locator("body")).toHaveClass(/\breading-focus\b/);
  await page.screenshot({
    path: "test-results/readalong-focus-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("free mobile lookup shares favorites, retains scroll position and imports old backups", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls: string[] = [];
  await page.route("https://translate.googleapis.com/**", async (route) => {
    calls.push(route.request().url());
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({
      json: [[["咖啡店", "coffee shop"]]],
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/speak");
  const inboxToggle = page.locator("#speaking-inbox-toggle");
  await expect(page.locator("#title")).not.toBeVisible();
  await inboxToggle.click();
  await expect(inboxToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#title")).toBeVisible();
  await inboxToggle.click();
  await expect(inboxToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#title")).not.toBeVisible();
  await page.locator("#focus-reading").click();
  await expect(page.locator(".sentence")).toHaveCount(5);
  const before = await page.evaluate(() => [
    scrollY,
    document.getElementById("sentences")!.scrollTop,
  ]);
  await selectText(page, "coffee shop");
  await expect(page.locator("#lookup-meaning")).toHaveValue("咖啡店");
  expect(calls).toHaveLength(1);
  expect(new URL(calls[0]).searchParams.get("q")).toBe("coffee shop");
  await page.locator("#lookup-save").click();
  await expect(page.locator("#lookup-save")).toHaveText(uiName("已加入单词库"));
  await page.screenshot({
    path: "test-results/readalong-word-mobile.png",
    fullPage: true,
  });
  await page.locator("#lookup-close").click();
  expect(
    await page.evaluate(() => [
      scrollY,
      document.getElementById("sentences")!.scrollTop,
    ]),
  ).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/vocabulary");
  await expect(
    page.getByRole("heading", { name: "coffee shop", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "coffee shop", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".word-source-badge").first()).toHaveText(
    uiName("口语"),
  );
  await page.locator(".appearance-details summary").click();
  await expect(page.locator(".appearance a")).toHaveAttribute(
    "href",
    /^\/speak\?article=/,
  );
  await page.locator(".appearance a").click();
  await expect(page.locator("#practiceTitle")).toHaveText(
    "A small pause in the day",
  );
  await expect(page.locator(".sentence.active")).toContainText("coffee shop");
  await page.goto("/speak");
  await page.locator("#focus-reading").click();
  const backup = [
    {
      id: "old-article",
      title: "My old article",
      text: "One original sentence. Two original sentences. Three original sentences.",
      index: 2,
      vocabulary: [{ text: "original", meaning: "原来的" }],
      apiKey: "do-not-restore",
    },
  ];
  await page.locator("#text-file").setInputFiles({
    name: "old-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator("#practiceTitle")).toHaveText("My old article");
  await expect(page.locator(".sentence.active")).toContainText(
    "Three original sentences",
  );
  await page.reload();
  await expect(page.locator(".sentence.active")).toContainText(
    "Three original sentences",
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("readalong.articles")!),
  );
  expect(stored.some((a: { id: string }) => a.id === "old-article")).toBe(true);
  expect(JSON.stringify(stored)).not.toContain("do-not-restore");
});

test("AI uses only the learner's key, blocks double submit and preserves successful translation on failure", async ({
  page,
}) => {
  let calls = 0,
    invalid = false;
  const siteAi: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/")) siteAi.push(request.url());
  });
  await page.route("https://learner-provider.example/**", async (route) => {
    calls++;
    expect(route.request().headers().authorization).toBe(
      "Bearer learner-test-key",
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: invalid
                ? "invalid JSON"
                : JSON.stringify({
                    paragraphs: [
                      { index: 0, zh: "第一段，原条件不变。" },
                      { index: 1, zh: "第二段，只在准备好时继续。" },
                    ],
                  }),
            },
          },
        ],
      },
    });
  });
  await page.goto("/speak");
  await page
    .locator("#text")
    .fill(
      "First paragraph keeps its condition.\n\nSecond paragraph only continues when ready.",
    );
  await page.locator("#generate").click();
  await page.locator("aside .import-options summary").click();
  await page.locator("#ai-translate").click();
  await expect(page.locator("#ai-status")).toContainText("填写自己的 Key");
  expect(calls).toBe(0);
  await page.evaluate(() =>
    sessionStorage.setItem(
      "wordweave.browser-ai.v1",
      JSON.stringify({
        baseUrl: "https://learner-provider.example/v1",
        model: "test-model",
        apiKey: "learner-test-key",
        thinking: "auto",
      }),
    ),
  );
  await page.evaluate(() => {
    const button = document.getElementById("ai-translate") as HTMLButtonElement;
    button.click();
    button.click();
  });
  await expect(page.locator("#ai-status")).toContainText("中文参考已准备好");
  expect(calls).toBe(1);
  await expect(page.locator("#article-help-body")).toContainText(
    "第一段，原条件不变。",
  );
  invalid = true;
  await page.locator("#ai-translate").click();
  await expect(page.locator("#ai-status")).toContainText("不是合法 JSON");
  expect(calls).toBe(2);
  await expect(page.locator("#article-help-body")).toContainText(
    "第一段，原条件不变。",
  );
  await expect(page.locator("#text")).toHaveValue(
    "First paragraph keeps its condition.\n\nSecond paragraph only continues when ready.",
  );
  expect(siteAi).toEqual([]);
});

test("old Read Along bookmarks still open the saved speaking sentence", async ({
  page,
}) => {
  await page.goto("/speak");
  await page.evaluate(() => {
    localStorage.setItem(
      "readalong.articles",
      JSON.stringify([
        {
          id: "existing-shadowing",
          title: "My speaking article",
          text: "First original sentence. Second original sentence. Third original sentence.",
          index: 0,
        },
      ]),
    );
  });
  for (const path of ["/read", "/"]) {
    await page.goto(`${path}?article=existing-shadowing&sentence=2#exercise`);
    await expect(page).toHaveURL(
      /\/speak\?article=existing-shadowing&sentence=2#exercise$/,
    );
    await expect(page.locator(".sentence.active")).toContainText(
      "Third original sentence.",
    );
    await expect(page.locator('nav.study-nav [aria-current="page"]')).toHaveText(
      uiName("口语"),
    );
  }
  await page.goto("/read");
  await expect(
    page.getByRole("heading", {
      name: uiName("一次点击之后：从 React 状态快照到可靠界面"),
    }),
  ).toBeVisible();
  await expect(page.locator("#sentences")).toHaveCount(0);
  await page.goto("/speak");
  await expect(page.locator("#practiceTitle")).toHaveText(
    "A small pause in the day",
  );
  await page.goto("/speak?article=existing-shadowing");
  await expect(page.locator("#practiceTitle")).toHaveText(
    "My speaking article",
  );
  await expect(page.locator(".sentence.active")).toContainText(
    "Third original sentence.",
  );
});
