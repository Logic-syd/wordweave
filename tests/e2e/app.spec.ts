import { test, expect } from "@playwright/test";
import { db } from "../../src/lib/db";
import { Prisma } from "@prisma/client";
let techId: string;
let germanId: string;
let originalProgress: Awaited<ReturnType<typeof db.readingProgress.findMany>> =
  [];
let originalPreferences: Awaited<
  ReturnType<typeof db.languagePreference.findMany>
> = [];
const createdArticles: string[] = [];
const backups = new Map<
  string,
  Awaited<ReturnType<typeof db.userVocabulary.findUniqueOrThrow>>
>();
test.beforeAll(async ({ request }) => {
  const articles = await (await request.get("/api/articles")).json();
  techId = articles.find(
    (a: { mode: string; origin: string }) =>
      a.mode === "tech" && a.origin.startsWith("demo"),
  ).id;
  germanId = articles.find(
    (a: { mode: string; origin: string }) =>
      a.mode === "german" && a.origin.startsWith("demo"),
  ).id;
  originalProgress = await db.readingProgress.findMany();
  originalPreferences = await db.languagePreference.findMany();
  const words = await db.userVocabulary.findMany();
  for (const w of words) backups.set(w.id, w);
});
test.afterAll(async () => {
  for (const [id, row] of backups) {
    const { id: _id, ...data } = row;
    void _id;
    await db.userVocabulary.update({ where: { id }, data });
  }
  await db.readingProgress.deleteMany({
    where: { articleId: { in: [techId, germanId] } },
  });
  for (const p of originalProgress)
    await db.readingProgress.upsert({
      where: { articleId: p.articleId },
      create: p,
      update: p,
    });
  const currentPrefs = await db.languagePreference.findMany();
  for (const p of currentPrefs)
    if (!originalPreferences.some((o) => o.id === p.id))
      await db.languagePreference.delete({ where: { id: p.id } });
  for (const p of originalPreferences)
    await db.languagePreference.upsert({
      where: { id: p.id },
      create: { ...p, settings: p.settings as Prisma.InputJsonValue },
      update: { ...p, settings: p.settings as Prisma.InputJsonValue },
    });
  await db.article.deleteMany({ where: { id: { in: createdArticles } } });
  await db.$disconnect();
});
test("desktop: correspondence, code, favorite, wordbook and preferences survive refresh", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "读一点，学会一点。" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/wordweave-home.png", fullPage: true });
  await page.goto(`/read/${techId}`);
  await expect(
    page.getByRole("heading", { name: "状态更新，并不会立刻发生" }),
  ).toBeVisible();
  await page.locator("#p0002 .original-details summary").click();
  await expect(page.locator("#p0002 .original-details")).toContainText(
    "This does not mean that every update is applied immediately.",
  );
  const detail = await (await request.get(`/api/articles/${techId}`)).json();
  const code = detail.sourceBlocks.find(
    (b: { kind: string }) => b.kind === "code",
  ).original;
  expect(await page.locator("pre code").textContent()).toBe(
    code.replace(/^```tsx\n/, "").replace(/\n```$/, "") + "\n",
  );
  await page
    .getByRole("button", {
      name: "查看词卡：avoid unnecessary re-renders",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "收藏到生词本", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已收藏", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭词卡" }).click();
  await page.getByLabel("释义显示方式").selectOption("click");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/articles/${techId}`)).json()).progress
          ?.glossMode,
    )
    .toBe("click");
  await page.locator("#p0005").scrollIntoViewIfNeeded();
  await page
    .locator("#p0005")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/articles/${techId}`)).json()).progress
          ?.paragraphId,
    )
    .toBe("p0005");
  await page.reload();
  await expect(page.getByLabel("释义显示方式")).toHaveValue("click");
  expect(
    await page.locator("#p0005").evaluate((e) => e.getBoundingClientRect().top),
  ).toBeLessThan(200);
  await page.goto("/vocabulary");
  await page.getByRole("button", { name: "只看收藏" }).click();
  await expect(
    page.getByRole("heading", {
      name: "avoid unnecessary re-renders",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText("出现过的语境").first().click();
  await expect(
    page.getByText(
      "React batches state updates to avoid unnecessary re-renders.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("mobile: bottom wordcard keeps position, review selection and German view work", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/read/${germanId}`);
  await expect(
    page.getByRole("button", { name: "查看词卡：Kasse", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "查看词卡：Kasse", exact: true })
    .scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await page
    .getByRole("button", { name: "查看词卡：Kasse", exact: true })
    .click();
  const card = page.getByRole("dialog");
  await expect(card).toBeVisible();
  const bounds = await card.boundingBox();
  expect(bounds!.y).toBeGreaterThan(100);
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await expect(page.getByText("die Kassen", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "想学", exact: true }).click();
  await expect
    .poll(async () =>
      (await (await request.get("/api/vocabulary?due=true")).json()).some(
        (w: { lemma: string }) => w.lemma === "Kasse",
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/wordweave-mobile-wordcard.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "关闭词卡" }).click();
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(
    4,
  );
  await expect(
    page.getByRole("button", { name: "查看词卡：Kasse", exact: true }),
  ).toBeFocused();
  await page.getByLabel("释义显示方式").selectOption("all");
  await page.getByRole("button", { name: "德语全文", exact: true }).click();
  await expect(page.locator("#p0005")).toContainText(
    "An der Kasse wartet eine ältere Frau.",
  );
  await page.getByRole("button", { name: "中文嵌词版", exact: true }).click();
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
  await expect(
    page.getByText("本次可带入复习：Kasse。生成后只记录实际覆盖的词。"),
  ).toBeVisible();
});
test("import validation, idempotency, missing API and deletion preserve explicitly saved words", async ({
  page,
  request,
}) => {
  const invalid = await request.post("/api/articles", {
    data: { title: "empty", mode: "tech", text: " ", settings: {} },
  });
  expect(invalid.status()).toBe(400);
  await page.goto("/new?mode=tech");
  await expect(
    page.getByRole("button", { name: "上传 TXT / Markdown" }),
  ).toBeEnabled();
  await page.locator("input[type=file]").setInputFiles({
    name: "code-import.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      '# Test\n\nDo not rewrite `a < b`.\n\n```js\nconst x = "hi";\n```\n\nRead [the docs][docs].\n\n[docs]: https://react.dev/learn',
    ),
  });
  await expect(page.locator("textarea")).toHaveValue(/const x = "hi"/);
  await page.getByRole("button", { name: "保存原文", exact: true }).click();
  await page.waitForURL(/\/read\//);
  const id = page.url().split("/read/")[1];
  createdArticles.push(id);
  await expect(page.locator("pre code")).toHaveText('const x = "hi";\n');
  await expect(
    page.getByRole("link", { name: "the docs", exact: true }),
  ).toHaveAttribute("href", "https://react.dev/learn");
  const missing = await request.post(`/api/articles/${id}/generate`, {
    data: {},
  });
  expect(missing.status()).toBe(503);
  await request.delete(`/api/articles/${id}`);
  const key = crypto.randomUUID();
  const input = {
    title: "idempotency-test",
    mode: "tech",
    text: "An article.",
    settings: {},
  };
  const [a, b] = await Promise.all([
    request.post("/api/articles", {
      data: input,
      headers: { "Idempotency-Key": key },
    }),
    request.post("/api/articles", {
      data: input,
      headers: { "Idempotency-Key": key },
    }),
  ]);
  expect(a.status()).toBe(201);
  expect(b.status()).toBe(201);
  const first = await a.json();
  createdArticles.push(first.id);
  expect((await b.json()).id).toBe(first.id);
  await request.delete(`/api/articles/${first.id}`);
});
