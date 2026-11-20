import { test, expect } from "./fixtures";
import { uiName } from "../ui-name.mjs";

test("desktop inbox imports beside contextual reading and preserves Markdown without an API", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const providerCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/chat/completions"))
      providerCalls.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".article-heading h1")).toHaveText(
    "状态更新，并不会立刻发生",
  );
  await expect(page.locator(".reader-top")).toHaveCount(0);
  await expect(page.locator(".reader-document .reader-toolbar")).toHaveCount(0);
  const inbox = page.locator(".reading-inbox");
  await expect(
    inbox.getByRole("heading", { name: uiName("文章收件箱") }),
  ).toBeVisible();
  const left = await inbox.boundingBox(),
    right = await page.locator(".reader-document").boundingBox();
  expect(left!.x + left!.width).toBeLessThan(right!.x);
  for (const [label, english] of [
    ["听力", "Listen"],
    ["口语", "Speak"],
    ["阅读", "Read"],
  ]) {
    const link = page
      .locator("nav.study-nav")
      .getByRole("link", { name: new RegExp(label) });
    await expect(link).toContainText(english);
    const style = await link.evaluate((el) => ({
      border: getComputedStyle(el).borderTopWidth,
      height: el.getBoundingClientRect().height,
    }));
    expect(parseFloat(style.border)).toBeGreaterThanOrEqual(1);
    expect(style.height).toBeGreaterThanOrEqual(48);
  }
  await page.screenshot({
    path: "test-results/bilingual-reading-desktop.png",
    fullPage: true,
  });
  const original =
    '# State updates\n\nKeep `state` and the condition unchanged.\n\n```js\nconst kept = "<tag> & original";\n```\n\n- Only update when ready.\n';
  await inbox.locator('input[type="file"]').setInputFiles({
    name: "Sidebar import.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(original),
  });
  await expect(inbox.getByLabel(uiName("英文正文"))).toHaveValue(original);
  await inbox.getByRole("button", { name: uiName("保存原文") }).click();
  await page.waitForURL(/\/read\/local-article-/);
  await expect(page.locator(".article-heading h1")).toHaveText(
    "Sidebar import",
  );
  await expect(page.locator("pre code")).toHaveText(
    'const kept = "<tag> & original";\n',
  );
  await page.reload();
  await expect(page.locator("pre code")).toHaveText(
    'const kept = "<tag> & original";\n',
  );
  expect(providerCalls).toEqual([]);
  await page.screenshot({
    path: "test-results/bilingual-reading-import.png",
    fullPage: true,
  });
});

test("mobile starts with the article and has visible bilingual mode buttons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/read");
  await expect(page.locator(".article-heading h1")).toBeInViewport();
  await expect(page.locator(".inbox-body")).not.toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("nav.study-nav")).toBeInViewport();
  }
  await page
    .getByRole("button", { name: "导入文章与阅读设置", exact: true })
    .click();
  await expect(page.getByLabel(uiName("英文正文"))).toBeVisible();
  await page.getByLabel("释义显示方式").selectOption("click");
  await page
    .getByRole("button", { name: "导入文章与阅读设置", exact: true })
    .click();
  await expect(page.locator(".article-heading h1")).toBeInViewport();
  await page.screenshot({
    path: "test-results/bilingual-reading-mobile.png",
    fullPage: true,
  });
  await page
    .locator("nav.study-nav")
    .getByRole("link", { name: /口语/ })
    .click();
  await expect(page.locator("#sentences .sentence")).toHaveCount(5);
  await expect(page.locator("nav.study-nav [aria-current=page]")).toContainText(
    "Speak",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/bilingual-speaking-mobile.png",
    fullPage: true,
  });
  await page
    .locator("nav.study-nav")
    .getByRole("link", { name: /听力/ })
    .click();
  await expect(page.locator("nav.study-nav [aria-current=page]")).toContainText(
    "Listen",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
