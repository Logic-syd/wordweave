import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const temporary = await mkdtemp(join(tmpdir(), "wordweave-dom-"));
const bundle = join(temporary, "dom.js");
await build({
  stdin: {
    contents:
      'export { extractPage } from "./extension/src/extract"; export { ReadingReplacement } from "./extension/src/render"; export { WordCard } from "./extension/src/word-card"; export { parseSource } from "./src/lib/markdown";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: bundle,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "WWDom",
});
const contentBundle = join(temporary, "content.js");
await build({
  entryPoints: ["extension/src/content.ts"],
  outfile: contentBundle,
  bundle: true,
  platform: "browser",
  format: "iife",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
  headless: true,
});
let passed = 0;
async function fixture(html) {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 760 },
  });
  await page.route("http://fixture.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>React learning</title></head><body>${html}</body></html>`,
    }),
  );
  await page.goto("http://fixture.test/article");
  await page.addScriptTag({ path: bundle });
  return page;
}
async function check(name, action) {
  await action();
  passed++;
  console.log(`✓ ${name}`);
}
try {
  await check(
    "content requires an actual user click before starting generation and ignores spoofed senders",
    async () => {
      const page = await fixture(
        "<article><p>A complete English paragraph for learning.</p></article>",
      );
      await page.evaluate(() => {
        window.messages = [];
        window.chrome = {
          runtime: {
            id: "fixture",
            getURL: () => "chrome-extension://fixture/",
            onMessage: {
              addListener: (handler) => {
                window.contentListener = handler;
              },
            },
            sendMessage: async (message) => {
              window.messages.push(message);
              return {
                ok: true,
                data:
                  message.type === "ww:preferences:get"
                    ? { retention: "medium", glossMode: "first" }
                    : { id: "job", status: "pending" },
              };
            },
          },
        };
      });
      await page.addScriptTag({ path: contentBundle });
      await page.evaluate(() =>
        window.contentListener(
          { type: "ww:open", scope: "article" },
          { id: "attacker", url: "http://fixture.test" },
          () => {},
        ),
      );
      assert.equal(
        await page
          .getByRole("button", { name: "生成学习版", exact: true })
          .count(),
        0,
      );
      await page.evaluate(() =>
        window.contentListener(
          { type: "ww:open", scope: "article" },
          { id: "fixture", url: "chrome-extension://fixture/popup.html" },
          () => {},
        ),
      );
      const generate = page.getByRole("button", {
        name: "生成学习版",
        exact: true,
      });
      await generate.waitFor();
      await generate.evaluate((button) => button.click());
      assert.equal(
        await page.evaluate(
          () =>
            window.messages.filter((message) => message.type === "ww:job:start")
              .length,
        ),
        0,
      );
      await generate.click();
      assert.equal(
        await page.evaluate(
          () =>
            window.messages.filter((message) => message.type === "ww:job:start")
              .length,
        ),
        1,
      );
      await page.close();
    },
  );
  await check(
    "wordcard can close while saving and a delayed response does not reopen it",
    async () => {
      const page = await fixture(
        '<article><p>A paragraph with a word.</p></article><button id="trigger">Open word</button>',
      );
      await page.evaluate(() => {
        window.chrome = {
          runtime: {
            sendMessage: () =>
              new Promise((resolve) => {
                window.finishSaving = resolve;
              }),
          },
        };
        const host = document.createElement("div");
        document.body.append(host);
        const root = host.attachShadow({ mode: "open" });
        const occurrence = {
          vocabularyId: "v1",
          meaning: "避免不必要的重新渲染",
          sentence: "React batches updates to avoid unnecessary re-renders.",
          word: {
            lemma: "avoid unnecessary re-renders",
            explanation: "描述优化的目的。",
            grammar: { note: "" },
            example: "React batches updates to avoid unnecessary re-renders.",
            exampleTranslation: "React 会批量处理更新，避免不必要的重新渲染。",
            user: null,
          },
        };
        const card = new WWDom.WordCard(root, () => {});
        card.open(occurrence, document.querySelector("#trigger"));
      });
      await page.getByRole("button", { name: "♡ 收藏", exact: true }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "♡ 收藏", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "关闭词卡", exact: true })
          .isDisabled(),
        false,
      );
      await page.getByRole("button", { name: "关闭词卡", exact: true }).click();
      await page.evaluate(() =>
        window.finishSaving({
          ok: true,
          data: { status: "LEARNING", favorite: true },
        }),
      );
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "trigger",
      );
      await page.close();
    },
  );
  await check(
    "extracts leaf English blocks, preserves Markdown code/links, excludes navigation and interactive content",
    async () => {
      const page = await fixture(
        '<nav><p>Never translate navigation</p></nav><article><h1>React state</h1><p id="body">React calls <code>setCount(count + 1)</code> with <a href="/docs">documentation</a>.</p><ul><li><p>A nested paragraph keeps its list.</p></li><li>A simple list item.</li></ul><pre><code>const n = 1;\nreturn n &lt; 2;</code></pre><p hidden>Hidden paragraph</p><p><button>Interactive button</button></p><p><code>first\nsecond</code> remains unchanged.</p></article><aside><p>Do not translate sidebar</p></aside>',
      );
      const result = await page.evaluate(() => {
        const extraction = WWDom.extractPage("article");
        return {
          ids: extraction.blocks.map((block) => block.id),
          markdown: extraction.blocks.map((block) => block.markdown),
          shapes: extraction.blocks.map((block) =>
            WWDom.parseSource(block.markdown).map((part) => part.kind),
          ),
          skipped: extraction.skippedMultilineCode,
        };
      });
      assert.deepEqual(result.ids, ["b0", "b1", "b2", "b3"]);
      assert.equal(result.skipped, 1);
      assert.match(result.markdown[1], /`setCount\(count \+ 1\)`/);
      assert.match(
        result.markdown[1],
        /\[documentation\]\(<http:\/\/fixture.test\/docs>\)/,
      );
      assert.deepEqual(result.shapes, [
        ["heading"],
        ["paragraph"],
        ["paragraph"],
        ["paragraph"],
      ]);
      await page.close();
    },
  );
  await check(
    "literal Markdown punctuation and all-space inline code preserve original text",
    async () => {
      const page = await fixture(
        "<main><p>1. A sentence with &amp;copy; and *stars*.</p><p>- A dash remains plain text.</p><p>Example <code>   </code> stays the same.</p></main>",
      );
      const result = await page.evaluate(() =>
        WWDom.extractPage("article").blocks.map((block) => ({
          markdown: block.markdown,
          parsed: WWDom.parseSource(block.markdown),
        })),
      );
      assert(
        result.every(
          (block) =>
            block.parsed.length === 1 && block.parsed[0].kind === "paragraph",
        ),
      );
      assert.match(result[2].markdown, /`   `/);
      await page.close();
    },
  );
  await check(
    "selection expands to complete paragraphs without sending adjacent text",
    async () => {
      const page = await fixture(
        '<article><p id="one">The first sentence is complete.</p><p id="two">The second paragraph is private.</p></article>',
      );
      const result = await page.evaluate(() => {
        const range = document.createRange();
        range.setStart(document.querySelector("#one").firstChild, 4);
        range.setEnd(document.querySelector("#one").firstChild, 9);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        return WWDom.extractPage("selection").blocks.map(
          (block) => block.markdown,
        );
      });
      assert.equal(result.length, 1);
      assert.match(result[0], /^The first sentence/);
      await page.close();
    },
  );
  await check(
    "oversized inputs fail explicitly instead of truncating",
    async () => {
      const page = await fixture(
        `<article>${Array.from({ length: 81 }, () => "<p>A complete English paragraph.</p>").join("")}</article>`,
      );
      const error = await page.evaluate(() => {
        try {
          WWDom.extractPage("article");
        } catch (error) {
          return error.message;
        }
      });
      assert.match(error, /81 段/);
      assert.match(error, /没有被截断/);
      await page.setContent(
        `<main><p>${"React state ".repeat(2000)}</p></main>`,
      );
      const characterError = await page.evaluate(() => {
        try {
          WWDom.extractPage("article");
        } catch (error) {
          return error.message;
        }
      });
      assert.match(characterError, /20,000/);
      await page.close();
    },
  );
  await check(
    "in-place replacement renders safe code/link/terms, known words hide glosses, original nodes retain events",
    async () => {
      const page = await fixture(
        '<article><p id="body">React calls <code>setCount(count + 1)</code> with <a id="link" href="/docs">documentation</a> to avoid unnecessary re-renders.</p><pre id="code"><code>const n = 1;\nreturn n &lt; 2;</code></pre></article>',
      );
      await page.evaluate(() => {
        window.originalLink = document.querySelector("#link");
        window.clicks = 0;
        window.originalLink.addEventListener("click", (event) => {
          event.preventDefault();
          window.clicks++;
        });
        window.originalHTML = document.querySelector("#body").innerHTML;
        window.originalCode = document.querySelector("#code").textContent;
        const extraction = WWDom.extractPage("article");
        const occurrence = {
          id: "o1",
          vocabularyId: "v1",
          sourceId: "b0",
          form: "avoid unnecessary re-renders",
          meaning: "避免不必要的重新渲染",
          sentence: "React calls setCount to avoid unnecessary re-renders.",
          targetKind: "new",
          word: {
            id: "v1",
            language: "en",
            lemma: "avoid unnecessary re-renders",
            user: null,
          },
        };
        window.session = new WWDom.ReadingReplacement(
          extraction.blocks,
          {
            version: {
              paragraphs: [
                {
                  sourceId: "b0",
                  segments: [
                    {
                      type: "text",
                      text: "React 调用 `setCount(count + 1)` 并阅读 [documentation](<http://fixture.test/docs>) 以 ",
                    },
                    {
                      type: "term",
                      text: "avoid unnecessary re-renders",
                      occurrenceId: "o1",
                    },
                  ],
                },
              ],
              occurrences: [occurrence],
            },
          },
          "all",
          () => {},
        );
      });
      assert.equal(
        await page.locator("[data-wordweave-learning] code").textContent(),
        "setCount(count + 1)",
      );
      assert.equal(
        await page.locator("[data-wordweave-learning] a").getAttribute("href"),
        "http://fixture.test/docs",
      );
      assert.equal(
        await page
          .getByRole("button", {
            name: "查看词卡：avoid unnecessary re-renders",
          })
          .count(),
        1,
      );
      assert.equal(await page.locator(".gloss").isVisible(), true);
      await page.evaluate(() =>
        window.session.updateWord("v1", { status: "KNOWN", favorite: true }),
      );
      assert.equal(await page.locator(".gloss").isVisible(), false);
      await page.getByRole("button", { name: "切换本段原文与学习版" }).click();
      assert.equal(await page.locator("#link").count(), 1);
      await page.getByRole("button", { name: "切换本段原文与学习版" }).click();
      await page.evaluate(() => window.session.restore());
      await page.locator("#link").click();
      const restored = await page.evaluate(() => ({
        equal: originalLink === document.querySelector("#link"),
        html: document.querySelector("#body").innerHTML === originalHTML,
        code: document.querySelector("#code").textContent === originalCode,
        clicks,
      }));
      assert.deepEqual(restored, {
        equal: true,
        html: true,
        code: true,
        clicks: 1,
      });
      await page.close();
    },
  );
  await check("model HTML and dangerous URLs never execute", async () => {
    const page = await fixture(
      "<article><p>Safe English paragraph.</p></article>",
    );
    await page.evaluate(() => {
      window.pwned = false;
      const extraction = WWDom.extractPage("article");
      new WWDom.ReadingReplacement(
        extraction.blocks,
        {
          version: {
            paragraphs: [
              {
                sourceId: "b0",
                segments: [
                  {
                    type: "text",
                    text: '<img src=x onerror="window.pwned=true"> [bad](javascript:alert(1)) <script>window.pwned=true</script>',
                  },
                ],
              },
            ],
            occurrences: [],
          },
        },
        "all",
        () => {},
      );
    });
    assert.equal(
      await page
        .locator(
          "[data-wordweave-learning] img, [data-wordweave-learning] script, [data-wordweave-learning] a",
        )
        .count(),
      0,
    );
    assert.equal(await page.evaluate(() => window.pwned), false);
    assert.match(
      await page
        .locator("[data-wordweave-learning]")
        .evaluate((host) => host.shadowRoot.textContent),
      /<img/,
    );
    await page.close();
  });
  await check(
    "first-occurrence gloss follows visible paragraph order rather than database ordering",
    async () => {
      const page = await fixture(
        '<article><p id="a">Paragraph A before a page change.</p><p id="b">Paragraph B containing a useful phrase.</p><p id="c">Paragraph C repeats the same phrase.</p></article>',
      );
      await page.evaluate(() => {
        const extraction = WWDom.extractPage("article");
        document.querySelector("#a").textContent = "Changed by website.";
        const occurrences = [2, 1, 0].map((index) => ({
          id: `o${index}`,
          vocabularyId: "v1",
          sourceId: `b${index}`,
          form: "useful phrase",
          meaning: "有用的表达",
          word: { user: null },
        }));
        new WWDom.ReadingReplacement(
          extraction.blocks,
          {
            version: {
              paragraphs: extraction.blocks.map((block, index) => ({
                sourceId: block.id,
                segments: [
                  {
                    type: "term",
                    text: "useful phrase",
                    occurrenceId: `o${index}`,
                  },
                ],
              })),
              occurrences,
            },
          },
          "first",
          () => {},
        );
      });
      assert.equal(await page.locator("#b .gloss").isVisible(), true);
      assert.equal(await page.locator("#c .gloss").isVisible(), false);
      await page.close();
    },
  );
  await check(
    "dynamic content changes are skipped and never overwritten during restore",
    async () => {
      const page = await fixture(
        '<article><p id="a">Original paragraph A.</p><p id="b">Original paragraph B.</p></article>',
      );
      const result = await page.evaluate(() => {
        const extraction = WWDom.extractPage("article");
        document.querySelector("#a").textContent =
          "Changed by website before generation.";
        const session = new WWDom.ReadingReplacement(
          extraction.blocks,
          {
            version: {
              paragraphs: extraction.blocks.map((block) => ({
                sourceId: block.id,
                segments: [{ type: "text", text: "学习版" }],
              })),
              occurrences: [],
            },
          },
          "first",
          () => {},
        );
        document.querySelector("#b").textContent =
          "Changed by website while reading.";
        return {
          count: session.count,
          skipped: session.skipped,
          restoreSkipped: session.restore(),
          a: document.querySelector("#a").textContent,
          b: document.querySelector("#b").textContent,
        };
      });
      assert.deepEqual(result, {
        count: 1,
        skipped: 1,
        restoreSkipped: 1,
        a: "Changed by website before generation.",
        b: "Changed by website while reading.",
      });
      await page.close();
    },
  );
  console.log(`${passed} extension DOM browser checks passed.`);
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
