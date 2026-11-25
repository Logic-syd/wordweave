import { test, expect } from "./fixtures";
import { uiName } from "../ui-name.mjs";

test("free reading levels change prose and preserve favorites, original, code and progress without requests", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" || r.method() === "PATCH") writes.push(r.url());
  });
  await page.goto("/read");
  const levels = page.locator(".inbox-reading-options .retention-control");
  await expect(levels).toBeVisible();
  await expect(
    levels.getByRole("button", { name: "中 / Medium", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const code = await page.locator("pre code").innerText();
  const snapshot = page.getByRole("button", {
    name: "查看词卡：snapshot of the state",
    exact: true,
  });
  await snapshot.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: uiName("收藏到生词本"), exact: true })
    .click();
  await page.getByRole("button", { name: "关闭词卡", exact: true }).click();
  await levels.getByRole("button", { name: "少 / Low", exact: true }).click();
  await expect(snapshot).toHaveCount(0);
  await expect(page.locator("#p0003")).toContainText(
    "每次渲染接收的都是 状态快照",
  );
  await levels.getByRole("button", { name: "多 / High", exact: true }).click();
  await expect(page.locator("#p0003 > p")).toContainText(
    "A useful starting point is that each render receives a",
  );
  await expect(snapshot).toHaveClass(/favorited/);
  await expect(page.locator("pre code")).toHaveText(code);
  await page.getByLabel("释义显示方式", { exact: true }).selectOption("click");
  await page
    .locator("#p0012")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("wordweave.samples.v1")!).progress[
            "sample-react-state-long-v1"
          ].paragraphId,
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
  await expect
    .poll(() =>
      page
        .locator("#p0012")
        .evaluate((el) => Math.abs(el.getBoundingClientRect().top)),
    )
    .toBeLessThan(200);
  await page
    .locator(".reader-views")
    .getByRole("button", { name: uiName("英文原文"), exact: true })
    .click();
  const original = await page.locator(".paragraphs").innerText();
  await levels.getByRole("button", { name: "少 / Low", exact: true }).click();
  await expect(page.locator(".paragraphs")).toHaveText(original);
  await expect(page.locator("pre code")).toHaveText(code);
  await page.goto("/vocabulary");
  await expect(page.locator(".vocabulary-row")).toContainText(
    "snapshot of the state",
  );
  await page.goto("/read?part=2");
  await expect(
    levels.getByRole("button", { name: "中 / Medium", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(writes).toEqual([]);
});

test("reading level controls fit small phones and stay separate from gloss settings", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/read");
    await page
      .getByRole("button", { name: "导入文章与阅读设置", exact: true })
      .click();
    const levels = page.locator(".inbox-reading-options .retention-control");
    await levels.scrollIntoViewIfNeeded();
    await levels
      .getByRole("button", { name: "多 / High", exact: true })
      .click();
    await expect(
      levels.getByRole("button", { name: "多 / High", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("释义显示方式", { exact: true })).toHaveValue(
      "first",
    );
    expect(
      await levels.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return [...el.querySelectorAll("button")].every((button) => {
          const r = button.getBoundingClientRect();
          return (
            r.width >= 44 &&
            r.height >= 44 &&
            r.left >= box.left &&
            r.right <= box.right
          );
        });
      }),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("an imported article sends the selected level only on explicit generation and keeps its successful version on failure", async ({
  page,
}) => {
  const sent: { retention: string; authorization: string }[] = [];
  const siteWrites: string[] = [];
  let fail = false;
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      new URL(request.url()).origin === new URL(page.url()).origin &&
      request.url().includes("/api/")
    )
      siteWrites.push(request.url());
  });
  await page.route(
    "https://retention-provider.example/v1/chat/completions",
    async (route) => {
      const request = route.request();
      const body = request.postDataJSON();
      const input = JSON.parse(body.messages[1].content);
      sent.push({
        retention: input.data.settings.retention,
        authorization: request.headers().authorization,
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const value = {
        title: "保留程度测试",
        terms: [
          {
            id: "avoid",
            lemma: "avoid unnecessary re-renders",
            partOfSpeech: "phrase",
            meaning: "避免不必要的重新渲染",
            grammar: {},
            explanation: "avoid 后接名词或动名词。",
            example:
              "React batches state updates to avoid unnecessary re-renders.",
            exampleTranslation:
              "React 批量处理状态更新，以避免不必要的重新渲染。",
            category: "general",
          },
        ],
        paragraphs: input.data.paragraphs.map((p: { id: string }) => ({
          id: p.id,
          segments: [
            { type: "text", text: "React 会批量处理状态更新，以 " },
            {
              type: "term",
              text: "avoid unnecessary re-renders",
              termId: "avoid",
              meaning: "避免不必要的重新渲染",
              sentence:
                "React batches state updates to avoid unnecessary re-renders.",
            },
            { type: "text", text: "。" },
          ],
        })),
      };
      await route.fulfill({
        status: fail ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          fail
            ? { error: { code: "invalid_api_key" } }
            : {
                choices: [
                  {
                    finish_reason: "stop",
                    message: { content: JSON.stringify(value) },
                  },
                ],
              },
        ),
      });
    },
  );
  await page.goto("/new?mode=tech");
  await page
    .getByRole("button", { name: uiName("只导入原文（免费）") })
    .click();
  await page
    .getByLabel(uiName("文章标题"), { exact: true })
    .fill("保留程度测试");
  await page
    .getByLabel(uiName("英文正文"), { exact: true })
    .fill(
      'React batches state updates to avoid unnecessary re-renders.\n\n```js\nconst untouched = "safe";\n```',
    );
  await page
    .getByRole("button", { name: uiName("保存原文"), exact: true })
    .click();
  await page.waitForURL(/\/read\/local-article-/);
  const articleUrl = page.url();
  const levels = page.locator(".inbox-reading-options .retention-control");
  await levels.getByRole("button", { name: "多 / High", exact: true }).click();
  await expect(
    page.getByRole("button", { name: uiName("明确重新生成"), exact: true }),
  ).toBeDisabled();
  expect(sent).toEqual([]);
  await page.goto("/settings");
  await page.getByLabel(uiName("AI 服务商")).selectOption("custom");
  await page
    .getByLabel(uiName("API 地址（Base URL）"))
    .fill("https://retention-provider.example/v1");
  await page.getByLabel(uiName("模型名称")).fill("fixture-model");
  await page.getByLabel(uiName("自己的 API Key")).fill("fixture-user-key");
  await page
    .getByRole("button", { name: uiName("保存配置"), exact: true })
    .click();
  await page.goto(articleUrl);
  await levels.getByRole("button", { name: "多 / High", exact: true }).click();
  expect(sent).toEqual([]);
  const generate = page.getByRole("button", {
    name: uiName("明确重新生成"),
    exact: true,
  });
  await generate.click();
  await expect(
    levels.getByRole("button", { name: "少 / Low", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".reading-content .term-button")).toHaveCount(1);
  expect(sent).toEqual([
    { retention: "high", authorization: "Bearer fixture-user-key" },
  ]);
  await expect(page.locator("pre code")).toHaveText(
    'const untouched = "safe";\n',
  );
  const previous = (await page.locator(".paragraphs").textContent())!;
  fail = true;
  await levels.getByRole("button", { name: "少 / Low", exact: true }).click();
  await expect(page.locator(".retention-pending")).toBeVisible();
  expect(sent).toHaveLength(1);
  await expect(page.locator(".paragraphs")).toHaveText(previous);
  await generate.click();
  await expect(page.locator(".reader-error")).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1].retention).toBe("low");
  await expect(page.locator(".paragraphs")).toHaveText(previous);
  await page.reload();
  await expect(
    levels.getByRole("button", { name: "多 / High", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".paragraphs")).toHaveText(previous);
  expect(siteWrites).toEqual([]);
});
