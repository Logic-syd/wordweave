import { createHash } from "node:crypto";
import { test, expect } from "./fixtures";
import seed from "../../src/content/daily-seed.json";
import {
  dailyEditionSchema,
  DAILY_FEED,
} from "../../src/lib/daily-publication";
import { uiName } from "../ui-name.mjs";

const initial = dailyEditionSchema.parse(seed[0]);
const tomorrow = "2026-11-26";
function remoteEdition() {
  const edition = structuredClone(initial);
  edition.date = tomorrow;
  edition.articles.forEach((article, index) => {
    article.id = `sample-daily-${tomorrow}-${index + 1}`;
    article.title = `远程期次测试 ${index + 1}`;
    for (const version of Object.values(article.versions))
      for (const term of version.content.terms) term.meaning += "（测试期次）";
  });
  return edition;
}

test("real processed daily reads work without a key and preserve reading levels and bookmarks", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(`${initial.date}T12:00:00Z`));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PATCH"].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto("/read");
  await expect(page.locator(".daily-lesson")).toHaveAttribute(
    "data-content-id",
    initial.articles[0].id,
  );
  await expect(page.locator(".daily-lesson")).toContainText("DeepSeek");
  const levels = page.locator(".inbox-reading-options .retention-control");
  const text = await page.locator(".paragraphs").innerText();
  await levels.getByRole("button", { name: "少 / Low", exact: true }).click();
  expect(await page.locator(".paragraphs").innerText()).not.toBe(text);
  await levels.getByRole("button", { name: "多 / High", exact: true }).click();
  await page.getByLabel("释义显示方式", { exact: true }).selectOption("click");
  await page
    .locator(".daily-lesson")
    .getByRole("button", {
      name: "保存到我的库 / Save to my library",
      exact: true,
    })
    .click();
  await page
    .locator("#p0012")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("wordweave.samples.v1")!).progress[id]
            .paragraphId,
        initial.articles[0].id,
      ),
    )
    .toBe("p0012");
  await page.reload();
  await expect(
    levels.getByRole("button", { name: "多 / High", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("释义显示方式", { exact: true })).toHaveValue(
    "click",
  );
  await expect(
    page
      .locator(".daily-lesson")
      .getByRole("button", { name: "已保存到我的库 / Saved", exact: true }),
  ).toBeDisabled();
  await page.goto("/read?part=2");
  await expect(page.locator(".daily-lesson")).toHaveAttribute(
    "data-content-id",
    initial.articles[1].id,
  );
  await page.goto("/read?lang=de");
  await expect(page.locator(".daily-lesson")).not.toHaveAttribute(
    "data-content-id",
    /sample-daily-/,
  );
  expect(writes).toEqual([]);
});

test("new editions arrive without a site rebuild; saved cards and old links survive offline reload", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(`${tomorrow}T12:00:00Z`));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const edition = remoteEdition();
  const body = JSON.stringify(edition);
  const sha256 = createHash("sha256").update(body).digest("hex");
  await page.route(`${DAILY_FEED}/index.json`, (route) =>
    route.fulfill({
      json: { schemaVersion: 1, editions: [{ date: tomorrow, sha256 }] },
    }),
  );
  await page.route(`${DAILY_FEED}/editions/${tomorrow}.json`, (route) =>
    route.fulfill({ contentType: "application/json", body }),
  );
  await page.goto("/read");
  await expect(page.locator(".daily-lesson")).toHaveAttribute(
    "data-content-id",
    edition.articles[0].id,
  );
  await page.locator(".reading-content .term-button").first().click();
  const dialog = page.getByRole("dialog");
  const word = await dialog.locator("h2").innerText();
  await dialog
    .getByRole("button", { name: uiName("收藏到生词本"), exact: true })
    .click();
  await page.getByRole("button", { name: "关闭词卡", exact: true }).click();
  await page.unrouteAll();
  await page.route(`${DAILY_FEED}/**`, (route) => route.abort());
  await page.goto("/vocabulary");
  await page.reload();
  await expect(
    page.locator(".vocabulary-row").filter({ hasText: word }).first(),
  ).toBeVisible();
  await page.goto(`/read/${edition.articles[0].id}`);
  await expect(page.locator(".reading-content")).toContainText(
    edition.articles[0].title,
  );
  await page.reload();
  await expect(page.locator(".reading-content")).toContainText(
    edition.articles[0].title,
  );
});

test("corrupt remote content keeps the last processed edition with its real date, including on phones", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(`${tomorrow}T12:00:00Z`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${DAILY_FEED}/index.json`, (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        editions: [{ date: tomorrow, sha256: "0".repeat(64) }],
      },
    }),
  );
  await page.route(`${DAILY_FEED}/editions/${tomorrow}.json`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(remoteEdition()),
    }),
  );
  await page.goto("/read");
  await expect(page.locator(".daily-lesson")).toHaveAttribute(
    "data-content-id",
    initial.articles[0].id,
  );
  await expect(page.locator(".daily-lesson")).toContainText(initial.date);
  await expect(page.locator(".daily-edition-status")).toBeVisible();
  const term = page.locator(".reading-content .term-button").first();
  await term.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await term.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "关闭词卡", exact: true }).click();
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - before),
  ).toBeLessThan(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
