import { uiName } from "../ui-name.mjs";
import { test, expect } from "./fixtures";
import { getSample } from "../../src/lib/samples";
const techId = "sample-react-state-v1";
const germanId = "sample-supermarket-v1";

test("desktop: correspondence, code, favorite, wordbook and preferences survive refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/read/${techId}`);
  await expect(
    page.getByRole("heading", { name: uiName("状态更新，并不会立刻发生") }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/wordweave-home.png", fullPage: true });
  await page.goto(`/read/${techId}`);
  await expect(
    page.getByRole("heading", { name: uiName("状态更新，并不会立刻发生") }),
  ).toBeVisible();
  await page.locator("#p0002 .original-details summary").click();
  await expect(page.locator("#p0002 .original-details")).toContainText(
    "This does not mean that every update is applied immediately.",
  );
  const detail = getSample(techId)!;
  const code = detail.sourceBlocks.find(
    (b: { kind: string }) => b.kind === "code",
  )!.original;
  expect(await page.locator("pre code").textContent()).toBe(
    code.replace(/^```tsx\n/, "").replace(/\n```$/, "") + "\n",
  );
  await page
    .getByRole("button", {
      name: uiName("查看词卡：avoid unnecessary re-renders"),
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: uiName("收藏到生词本"), exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: uiName("已收藏"), exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: uiName("关闭词卡") }).click();
  await page.getByLabel(uiName("释义显示方式")).selectOption("click");
  await expect
    .poll(async () =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("wordweave.samples.v1") ?? "{}")
            .progress?.[id]?.glossMode,
        techId,
      ),
    )
    .toBe("click");
  await page.locator("#p0005").scrollIntoViewIfNeeded();
  await page
    .locator("#p0005")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await expect
    .poll(async () =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("wordweave.samples.v1") ?? "{}")
            .progress?.[id]?.paragraphId,
        techId,
      ),
    )
    .toBe("p0005");
  await page.reload();
  await expect(page.getByLabel(uiName("释义显示方式"))).toHaveValue("click");
  expect(
    await page.locator("#p0005").evaluate((e) => e.getBoundingClientRect().top),
  ).toBeLessThan(200);
  await page.goto("/vocabulary");
  await page.getByRole("button", { name: uiName("只看收藏") }).click();
  await expect(
    page.getByRole("heading", {
      name: "avoid unnecessary re-renders",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText(uiName("出现过的语境")).first().click();
  await expect(
    page.getByText(
      "React batches state updates to avoid unnecessary re-renders.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("mobile: bottom wordcard keeps position, review selection and German view work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/read/${germanId}`);
  await expect(
    page.getByRole("button", { name: uiName("查看词卡：Kasse"), exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: uiName("查看词卡：Kasse"), exact: true })
    .scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await page
    .getByRole("button", { name: uiName("查看词卡：Kasse"), exact: true })
    .click();
  const card = page.getByRole("dialog");
  await expect(card).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds!.y).toBeGreaterThan(100);
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await expect(page.getByText("die Kassen", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: uiName("想学"), exact: true }).click();
  await expect(
    card.getByRole("button", { name: uiName("想学"), exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "/tmp/wordweave-mobile-wordcard.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: uiName("关闭词卡") }).click();
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(
    4,
  );
  await expect(
    page.getByRole("button", { name: uiName("查看词卡：Kasse"), exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "导入文章与阅读设置", exact: true })
    .click();
  await page.getByLabel(uiName("释义显示方式")).selectOption("all");
  await page
    .getByRole("button", { name: uiName("德语全文"), exact: true })
    .click();
  await expect(page.locator("#p0005")).toContainText(
    "An der Kasse wartet eine ältere Frau.",
  );
  await page
    .getByRole("button", { name: uiName("中文嵌词版"), exact: true })
    .click();
  await page.screenshot({
    path: "/tmp/wordweave-mobile-reader.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/new?mode=german");
  await page.getByLabel(uiName("AI 服务商")).selectOption("deepseek");
  await page.getByLabel(uiName("自己的 API Key")).fill("fixture-review-key");
  await page.getByLabel(uiName("模型名称")).fill("user-selected-model");
  await page
    .getByRole("button", { name: uiName("保存并继续"), exact: true })
    .click();
  await expect(
    page.locator(".review-summary").filter({ hasText: "Kasse" }),
  ).toBeVisible();
});
test("public import validates input, preserves Markdown and deletes locally without a Key", async ({
  page,
}) => {
  const siteWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/"))
      siteWrites.push(request.url());
  });
  await page.goto("/new?mode=tech");
  await page
    .getByRole("button", { name: uiName("只导入原文（免费）") })
    .click();
  await page
    .getByLabel(uiName("文章标题"), { exact: true })
    .fill("浏览器导入测试");
  await page
    .getByRole("button", { name: uiName("保存原文"), exact: true })
    .click();
  await expect(page.locator(".error-box")).toContainText("请先输入文章正文");
  await page.locator("input[type=file]").setInputFiles({
    name: "code-import.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      '# Test\n\nDo not rewrite `a < b`.\n\n```js\nconst x = "hi";\n```\n\nRead [the docs][docs].\n\n[docs]: https://react.dev/learn',
    ),
  });
  await expect(page.locator("textarea")).toHaveValue(/const x = "hi"/);
  await page
    .getByLabel(uiName("文章标题"), { exact: true })
    .fill("浏览器导入测试");
  await page
    .getByRole("button", { name: uiName("保存原文"), exact: true })
    .click();
  await page.waitForURL(/\/read\/local-article-/);
  const articleUrl = page.url();
  await expect(page.locator("pre code")).toHaveText('const x = "hi";\n');
  await expect(
    page.getByRole("link", { name: "the docs", exact: true }),
  ).toHaveAttribute("href", "https://react.dev/learn");
  await page.goto("/library");
  await expect(page.locator(".article-card")).toHaveCount(13);
  await page
    .getByRole("button", {
      name: uiName("删除文章：浏览器导入测试"),
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: uiName("确认删除"), exact: true })
    .click();
  await expect(page.locator(".article-card")).toHaveCount(12);
  await page.goto(articleUrl);
  await expect(page.locator(".practice-notice")).toContainText(
    "这个浏览器里没有这篇文章",
  );
  expect(siteWrites).toEqual([]);
});

test("home and three entries keep contextual reading, shadowing and listening distinct", async ({
  page,
}) => {
  const diagnostics: string[] = [];
  page.on("pageerror", (error) => diagnostics.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: uiName("一次点击之后：从 React 状态快照到可靠界面"),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: uiName("查看词卡：avoid unnecessary re-renders"),
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#sentences")).toHaveCount(0);
  await expect(page.locator('nav.study-nav [aria-current="page"]')).toHaveText(
    uiName("阅读"),
  );
  await page.goto("/listen");
  await expect(
    page.getByRole("button", { name: uiName("播放这一段"), exact: true }),
  ).toBeInViewport();
  await expect(page.locator(".practice-tools")).not.toHaveAttribute("open");
  await page
    .getByRole("navigation", { name: uiName("听说读导航") })
    .getByRole("link", { name: uiName("口语"), exact: true })
    .click();
  await expect(page.locator("#practiceTitle")).toHaveText(
    "A small pause in the day",
  );
  await expect(page.locator(".sentence")).toHaveCount(5);
  await expect(page.locator('nav.study-nav [aria-current="page"]')).toHaveText(
    uiName("口语"),
  );
  await page.getByLabel(uiName("更多功能")).click();
  await page
    .getByRole("link", { name: uiName("复述与录音"), exact: true })
    .click();
  await expect(page.locator(".transcript-text")).toBeInViewport();
  await expect(page).toHaveURL(/\/speak\/practice/);
  await page
    .getByRole("navigation", { name: uiName("听说读导航") })
    .getByRole("link", { name: uiName("阅读"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: uiName("一次点击之后：从 React 状态快照到可靠界面"),
    }),
  ).toBeVisible();
  await expect(page.locator("#sentences")).toHaveCount(0);
  await page.goto(`/read/${germanId}`);
  await expect(page.locator(".article-heading h1")).toBeVisible();
  const germanTitle = await page.locator(".article-heading h1").innerText();
  await page
    .getByRole("button", { name: "导入文章与阅读设置", exact: true })
    .click();
  await page.getByLabel(uiName("释义显示方式")).selectOption("click");
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("wordweave.samples.v1") ?? "{}")
            .progress?.[id]?.glossMode,
        germanId,
      ),
    )
    .toBe("click");
  await page.getByRole("link", { name: uiName("语境 · 继续学习") }).click();
  await expect(page.locator(".article-heading h1")).toHaveText(
    uiName("一次点击之后：从 React 状态快照到可靠界面"),
  );
  await page.goto(`/read/${germanId}`);
  await expect(page.locator(".article-heading h1")).toHaveText(germanTitle);
  await expect(page.getByLabel(uiName("释义显示方式"))).toHaveValue("click");
  await page.reload();
  await expect(page.locator(".article-heading h1")).toHaveText(germanTitle);
  await expect(page.getByLabel(uiName("释义显示方式"))).toHaveValue("click");
  expect(diagnostics).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("legacy speaking material links and listening crosslinks retain the exercise", async ({
  page,
}) => {
  await page.goto("/listen");
  const link = await page
    .getByRole("link", { name: uiName("这段也拿来说") })
    .getAttribute("href");
  expect(link).toMatch(/^\/speak\/practice\?material=/);
  await page.goto(link!.replace("/speak/practice?", "/speak?"));
  await expect(page).toHaveURL(/\/speak\/practice\?material=/);
  await expect(page.locator(".transcript-text")).toBeVisible();
  await page.reload();
  await expect(page.locator(".transcript-text")).toBeVisible();
});
