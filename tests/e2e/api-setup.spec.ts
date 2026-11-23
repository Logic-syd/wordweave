import { test, expect } from "./fixtures";
import { uiName } from "../ui-name.mjs";

test("reading configures a personal API in place, preserves drafts and keeps keys off the site", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const sent: { url: string; authorization: string | undefined }[] = [];
  const siteWrites: string[] = [];
  let fail = true;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).origin === new URL(page.url()).origin
    )
      siteWrites.push(request.url());
  });
  await page.route(
    "https://personal-api.example/v1/chat/completions",
    async (route) => {
      const request = route.request();
      sent.push({
        url: request.url(),
        authorization: request.headers().authorization,
      });
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
                    message: { content: '{"ok":true}' },
                  },
                ],
              },
        ),
      });
    },
  );
  await page.goto("/");
  const inbox = page.locator(".reading-inbox");
  const provider = inbox.getByLabel(uiName("AI 服务商"));
  const key = inbox.getByLabel(uiName("自己的 API Key"));
  const model = inbox.getByLabel(uiName("模型名称"));
  await expect(provider).toHaveValue("");
  await expect(inbox.getByLabel(uiName("英文正文"))).toHaveCount(0);
  await expect(inbox.locator(".api-key-notice")).toContainText(
    "Key 不上传到语境服务器",
  );
  for (const value of ["openai", "anthropic", "xai", "deepseek"]) {
    await provider.selectOption(value);
    await expect(key).toHaveValue("");
    await key.fill("fixture-old-provider-key");
  }
  await provider.selectOption("custom");
  await expect(key).toHaveValue("");
  const baseUrl = inbox.getByLabel(uiName("API 地址（Base URL）"));
  await baseUrl.fill(new URL(page.url()).origin + "/v1");
  await key.fill("fixture-personal-key");
  await model.fill("user-selected-model");
  await inbox
    .getByRole("button", { name: uiName("保存并继续"), exact: true })
    .click();
  await expect(inbox.getByRole("alert")).toContainText(
    "Key 不会发送到语境网站",
  );
  await baseUrl.fill("https://personal-api.example/v1");
  await expect(key).toHaveValue("");
  await key.fill("fixture-personal-key");
  expect(sent).toEqual([]);
  await inbox
    .getByRole("button", { name: uiName("测试连接（使用少量额度）") })
    .click();
  await expect(inbox.getByRole("alert")).toBeVisible();
  await expect(key).toHaveValue("fixture-personal-key");
  await expect(provider).toBeVisible();
  fail = false;
  await inbox
    .getByRole("button", { name: uiName("测试连接（使用少量额度）") })
    .click();
  await expect(inbox.getByRole("status")).toContainText("连接成功");
  await inbox
    .getByRole("button", { name: uiName("保存并继续"), exact: true })
    .click();
  await expect(inbox.getByLabel(uiName("英文正文"))).toBeVisible();
  await expect(
    inbox.getByRole("button", { name: uiName("保存并生成学习版") }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("wordweave.browser-ai.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("wordweave.browser-ai.v1")!).apiKey,
    ),
  ).toBe("fixture-personal-key");
  await inbox
    .getByLabel(uiName("文章标题"), { exact: true })
    .fill("My unfinished article");
  await inbox
    .getByLabel(uiName("英文正文"))
    .fill("Keep this draft while changing API settings.");
  await inbox
    .getByRole("button", { name: uiName("修改 API"), exact: true })
    .click();
  await provider.selectOption("xai");
  await expect(key).toHaveValue("");
  await inbox
    .getByRole("button", { name: uiName("取消"), exact: true })
    .click();
  await expect(inbox.getByLabel(uiName("英文正文"))).toHaveValue(
    "Keep this draft while changing API settings.",
  );
  await page.reload();
  await expect(inbox.locator(".inbox-api-status")).toContainText(
    "user-selected-model",
  );
  await inbox
    .getByRole("button", { name: uiName("修改 API"), exact: true })
    .click();
  await inbox
    .getByRole("button", { name: uiName("移除 Key"), exact: true })
    .click();
  await expect(key).toHaveValue("");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("wordweave.browser-ai.v1"),
    ),
  ).toBeNull();
  await expect(page.locator(".article-heading h1")).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(
    sent.every(
      (request) => request.authorization === "Bearer fixture-personal-key",
    ),
  ).toBe(true);
  expect(siteWrites).toEqual([]);
});

test("mobile API setup is usable and remembering a key is an explicit choice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "导入文章与阅读设置", exact: true })
    .click();
  await page.getByLabel(uiName("AI 服务商")).selectOption("deepseek");
  await page
    .getByLabel(uiName("自己的 API Key"))
    .fill("fixture-remembered-key");
  await page.getByLabel(uiName("模型名称")).fill("user-selected-model");
  await page.getByText(uiName("存储与高级设置"), { exact: true }).click();
  const remember = page.getByRole("checkbox", { name: /在这个浏览器记住 Key/ });
  await expect(remember).not.toBeChecked();
  await remember.check();
  await page
    .getByRole("button", { name: uiName("保存并继续"), exact: true })
    .click();
  await expect(page.getByLabel(uiName("英文正文"))).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("wordweave.browser-ai.v1")!).apiKey,
    ),
  ).toBe("fixture-remembered-key");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("wordweave.browser-ai.v1"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/settings");
  await expect(page.getByLabel(uiName("AI 服务商"))).toHaveValue("deepseek");
  await page
    .getByRole("button", { name: uiName("移除 Key"), exact: true })
    .click();
  await page.goto("/");
  await page
    .getByRole("button", { name: "导入文章与阅读设置", exact: true })
    .click();
  await expect(page.getByLabel(uiName("自己的 API Key"))).toHaveValue("");
  await expect(page.getByLabel(uiName("AI 服务商"))).toHaveValue("");
});
