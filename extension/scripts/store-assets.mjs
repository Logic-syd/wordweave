/** Capture the shipped settings UI, not simulated translation results. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const output = path.join(root, "store/chrome/images");
const manifest = JSON.parse(
  await readFile(path.join(dist, "manifest.json"), "utf8"),
);
const protocol = await build({
  entryPoints: [path.join(root, "src/protocol.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { DEFAULT_CONFIG } = await import(
  `data:text/javascript;base64,${Buffer.from(protocol.outputFiles[0].contents).toString("base64")}`
);
assert.equal(DEFAULT_CONFIG.aiApiKey, "");
assert.equal(DEFAULT_CONFIG.translationMode, "free");

const promo = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<style>
*{box-sizing:border-box}html,body{margin:0;width:440px;height:280px;overflow:hidden}
body{background:#fbf6f8;color:#403139;font-family:"Noto Sans CJK SC",sans-serif;padding:34px 36px}
header{display:flex;align-items:center;gap:19px}img{width:76px;height:76px}
h1{font-size:42px;line-height:1.15;letter-spacing:5px;margin:0;font-weight:700}
p{font-size:23px;line-height:1.5;letter-spacing:1px;margin:23px 0 17px}
footer{display:inline-block;font-size:14px;color:#80536a;background:#f1e4eb;border-radius:20px;padding:7px 14px}
</style><header><img src="/icons/icon.svg" alt=""><h1>语境</h1></header>
<p>边读，边学一点英文。</p><footer>免费翻译 · 可选自带 AI Key</footer></html>`;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/promo.html") {
      response.writeHead(200, { "Content-Type": types[".html"] }).end(promo);
      return;
    }
    const file = path.resolve(dist, `.${pathname}`);
    if (!file.startsWith(`${dist}/`)) throw new Error("Invalid asset path");
    response
      .writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      })
      .end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
let browser;
try {
  await mkdir(output, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // This only supplies initial defaults. No provider result or translation is fabricated.
  await page.addInitScript((config) => {
    window.chrome = {
      runtime: {
        sendMessage: async (message) => {
          if (message.type !== "ww:config:get")
            throw new Error("Unexpected preview action");
          return { ok: true, data: config };
        },
      },
    };
  }, DEFAULT_CONFIG);
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === baseURL
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`${baseURL}/options.html`);
  await page.locator("#save:not(:disabled)").waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator("#ai-key").inputValue(), "");
  assert.deepEqual(errors, []);
  const card = await page.locator(".settings-card").boundingBox();
  assert.ok(card && card.y + card.height <= 800, "Settings card is cut off");
  await page.screenshot({ path: path.join(output, "settings-1280x800.png") });
  await page.setViewportSize({ width: 440, height: 280 });
  await page.goto(`${baseURL}/promo.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: path.join(output, "promo-440x280.png") });
  await writeFile(
    path.join(output, "provenance.json"),
    JSON.stringify(
      {
        version: manifest.version,
        settingsScreenshot:
          "Shipped options.html, options.js and ui.css. Initial config read bridged to DEFAULT_CONFIG. No translation results, credentials or account data. This is a settings UI preview, not native-extension or provider verification.",
        promo:
          "Existing project sprite and factual product copy rendered locally.",
        sizes: {
          "settings-1280x800.png": [1280, 800],
          "promo-440x280.png": [440, 280],
        },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `已生成 ${manifest.version} 商店截图与宣传图：extension/store/chrome/images`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
