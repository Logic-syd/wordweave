/** Runs against the isolated production server owned by auth-http-smoke.mjs. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

export async function checkPublicBrowsing(baseURL, ownerToken) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
  });
  const context = await browser.newContext({ baseURL });
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  const privateWrites = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/api\/(?:articles|vocabulary)/.test(request.url())
    )
      privateWrites.push(request.url());
  });
  const screenshots = "test-results/public-browsing";
  await mkdir(screenshots, { recursive: true });
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "读一点，学会一点。" }),
    ).toBeVisible();
    await expect(
      page.getByText("免费阅读 · 无需登录", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /状态更新，并不会立刻发生/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /看房那天/ })).toBeVisible();
    await page.goto("/library?mode=german");
    await expect(page.locator(".article-card")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^删除文章/ })).toHaveCount(
      0,
    );
    await page.goto("/read/sample-react-state-v1");
    const term = page
      .getByRole("button", {
        name: "查看词卡：avoid unnecessary re-renders",
        exact: true,
      })
      .first();
    await expect(term).toBeEnabled();
    await term.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "收藏到生词本", exact: true })
      .click();
    await expect(dialog.getByText("已保存在这个浏览器")).toBeVisible();
    await dialog.getByRole("button", { name: "关闭词卡" }).click();
    await page.getByLabel("释义显示方式").selectOption("click");
    await page.getByRole("button", { name: "标记读完", exact: true }).click();
    await page.reload();
    await expect(page.getByLabel("释义显示方式")).toHaveValue("click");
    await expect(
      page.getByRole("button", { name: "已读完 · 再读一遍也很好" }),
    ).toBeVisible();
    await page.goto("/vocabulary");
    await expect(
      page.getByRole("heading", {
        name: "avoid unnecessary re-renders",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      privateWrites.length,
      0,
      "Guest reading/favorites must remain local",
    );

    await page.goto("/new?mode=tech");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByLabel("文章标题", { exact: true })
      .fill("保留输入的浏览器测试");
    await page
      .getByLabel("英文正文", { exact: true })
      .fill("React batches state updates to avoid unnecessary re-renders.");
    await page.getByRole("button", { name: "保存并生成学习版" }).click();
    await expect(
      page.getByRole("dialog", { name: "登录个人空间" }),
    ).toBeVisible();
    assert.equal(privateWrites.length, 0, "Prompt must precede any upload");
    await page
      .getByLabel("访问密码", { exact: true })
      .fill("invalid-test-token");
    await page.getByRole("button", { name: "验证并继续" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await page.getByLabel("访问密码", { exact: true }).fill(ownerToken);
    await page.getByRole("button", { name: "验证并继续" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("英文正文", { exact: true })).toHaveValue(
      "React batches state updates to avoid unnecessary re-renders.",
    );
    await expect(page.getByRole("status")).toContainText("已验证");
    assert.equal(
      privateWrites.length,
      0,
      "Authentication must not silently submit or charge",
    );

    await page.goto("/library");
    await expect(page.getByRole("link", { name: /邀请朋友/ })).toHaveCount(0);
    await page.goto("/login#invite=obsolete-friend-code");
    await expect(page).not.toHaveURL(/#invite=/);

    await page.goto("/new?mode=tech");
    await expect(page.getByText(/今日已生成 \d+ \/ 20 次/)).toBeVisible();
    await page.getByText(/今日已生成 \d+ \/ 20 次/).click();
    await expect(page.getByText(/^模型请求 \d+ \/ 100 次/)).toBeVisible();

    const visitor = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    const mobile = await visitor.newPage();
    await mobile.goto("/vocabulary");
    await expect(mobile.getByText("这里还没有符合条件的词")).toBeVisible();
    await mobile.goto("/read/sample-commute-v1");
    await expect(
      mobile.getByRole("button", { name: "查看词卡：Bahnhof", exact: true }),
    ).toBeEnabled();
    await mobile
      .getByRole("button", { name: "查看词卡：Bahnhof", exact: true })
      .click();
    await expect(mobile.getByRole("dialog")).toBeVisible();
    const scroll = await mobile.evaluate(() => scrollY);
    await mobile.screenshot({
      path: `${screenshots}/sample-mobile.png`,
      fullPage: false,
    });
    await mobile.getByRole("button", { name: "关闭词卡" }).click();
    assert.ok(Math.abs((await mobile.evaluate(() => scrollY)) - scroll) < 3);
    await mobile.goto("/new?mode=tech");
    await mobile.getByRole("button", { name: /上传/ }).click();
    await expect(
      mobile.getByRole("dialog", { name: "登录个人空间" }),
    ).toBeVisible();
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mobile.screenshot({
      path: `${screenshots}/upload-login-mobile.png`,
      fullPage: false,
    });
    await mobile.getByRole("button", { name: "暂时不用" }).click();
    await expect(mobile.getByRole("dialog")).toHaveCount(0);
    await mobile.goto("/extension");
    await expect(
      mobile.getByRole("heading", { name: "把小精灵装进浏览器" }),
    ).toBeVisible();
    await mobile.getByRole("link", { name: "插件隐私说明" }).click();
    await expect(
      mobile.getByRole("heading", { name: "语境插件隐私说明", exact: true }),
    ).toBeVisible();
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await visitor.close();
    assert.deepEqual(errors, []);
    return "Public browser: eight samples, mode filter, local favorites/progress, isolated visitors, personal login prompt, invalid/valid login preserving input, mobile reader and plugin install page";
  } finally {
    await context.close();
    await browser.close();
  }
}
