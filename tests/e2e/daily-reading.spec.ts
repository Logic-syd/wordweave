import { test, expect } from "./fixtures";

test("two complete daily English articles have separate bookmarks and reading progress without API calls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const calls: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" ||
      /chat\/completions|api\.anthropic\.com/.test(request.url())
    )
      calls.push(request.url());
  });
  await page.goto("/read");
  const bar = page.locator(".daily-lesson");
  const firstId = await bar.getAttribute("data-content-id");
  const firstTitle = await page.locator(".article-heading h1").innerText();
  expect(
    Number(
      await page.locator(".reading-length").getAttribute("data-word-count"),
    ),
  ).toBeGreaterThanOrEqual(1000);
  await expect(page.locator(".article-heading")).toContainText("原创练习长文");
  await page.locator("#p0002 .original-details summary").click();
  await expect(page.locator("#p0002 .original-details")).toContainText(
    "Imagine a small shopping application",
  );
  await expect(page.locator("pre code")).toContainText(
    "setCount(previous => previous + 1)",
  );
  await page
    .getByRole("button", { name: /查看词卡：reason about/, exact: false })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Before changing the code",
  );
  await page.getByRole("button", { name: /收藏到生词本/ }).click();
  await expect(page.getByRole("button", { name: /已收藏/ })).toBeVisible();
  await page.getByRole("button", { name: /关闭词卡/ }).click();
  await bar.locator(".lesson-save button").click();
  await expect(bar.locator(".lesson-save button")).toBeDisabled();
  await page
    .locator(".daily-reading-switch")
    .getByRole("link", { name: /第二篇/ })
    .click();
  await page.waitForURL(/part=2/);
  const secondId = await bar.getAttribute("data-content-id");
  const secondTitle = await page.locator(".article-heading h1").innerText();
  expect(secondId).not.toBe(firstId);
  expect(secondTitle).not.toBe(firstTitle);
  expect(
    Number(
      await page.locator(".reading-length").getAttribute("data-word-count"),
    ),
  ).toBeGreaterThanOrEqual(1000);
  await expect(bar.locator(".lesson-save button")).toBeEnabled();
  await bar.locator(".lesson-save button").click();
  await expect(bar.locator(".lesson-save button")).toBeDisabled();
  await page
    .locator("#p0012")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("wordweave.samples.v1") ?? "{}")
            .progress?.[id!]?.paragraphId,
        secondId,
      ),
    )
    .toBe("p0012");
  await page.reload();
  await expect(page.locator(".article-heading h1")).toHaveText(secondTitle);
  await expect
    .poll(() =>
      page
        .locator("#p0012")
        .evaluate((el) => Math.abs(el.getBoundingClientRect().top)),
    )
    .toBeLessThan(200);
  await page.goto("/read");
  await expect(page.locator(".article-heading h1")).toHaveText(firstTitle);
  await expect(bar.locator(".lesson-save button")).toBeDisabled();
  await page.goto("/library");
  await expect(page.locator(".saved-lesson-card")).toHaveCount(2);
  await expect(page.locator(".saved-lessons")).toContainText(firstTitle);
  await expect(page.locator(".saved-lessons")).toContainText(secondTitle);
  await page.goto("/vocabulary");
  await expect(page.locator(".vocabulary-row")).toContainText("reason about");
  expect(calls).toEqual([]);
});

test("the two-article switch fits small phones and the selected article survives refresh", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/read");
    const picker = page.locator(".daily-reading-switch");
    await expect(picker.getByRole("link")).toHaveCount(2);
    await expect(picker).toBeInViewport();
    await expect(page.locator(".article-heading h1")).toBeInViewport();
    await picker.getByRole("link", { name: /第二篇/ }).click();
    await page.waitForURL(/part=2/);
    const title = await page.locator(".article-heading h1").innerText();
    await page.reload();
    await expect(page.locator(".article-heading h1")).toHaveText(title);
    await expect(picker.getByRole("link", { name: /第二篇/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/read?lang=de");
  await expect(page.locator(".article-heading")).toContainText("德语日常");
  await expect(page.locator(".daily-reading-switch")).toHaveCount(0);
});
