/** Test Netlify's real redirect engine against the emitted static reader.
 * This checks CDN aliases, not the hosted Next.js/Edge Functions runtime.
 * Run after `npm run build:web` with Netlify CLI available on PATH.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), "wordweave-netlify-routes-"));
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const artifacts = process.env.NETLIFY_STATIC_DIR || join(root, "public");
let child,
  browser,
  log = "",
  startupError;
try {
  const published = join(scratch, "public", "read-along");
  await mkdir(published, { recursive: true });
  await copyFile(join(root, "netlify.toml"), join(scratch, "netlify.toml"));
  for (const file of ["index.html", "readalong.js", "readalong.css"]) {
    const path = join(artifacts, "read-along", file);
    // Also catch an incomplete or stale Netlify asset bundle.
    assert.deepEqual(
      await readFile(path),
      await readFile(join(root, "public", "read-along", file)),
    );
    await copyFile(path, join(published, file));
  }
  child = spawn(
    process.env.NETLIFY_CLI || "netlify",
    [
      "dev",
      "--offline",
      "--no-open",
      "--skip-gitignore",
      "--framework",
      "#static",
      // This isolated fixture contains only public files, with no edge functions.
      // Skip the unrelated edge bootstrap download; production middleware is unchanged.
      "--internal-disable-edge-functions",
      "--dir",
      "public",
      "--port",
      String(port),
    ],
    {
      cwd: scratch,
      detached: true,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(scratch, "config"),
        XDG_CACHE_HOME: join(scratch, "cache"),
        NETLIFY_TELEMETRY_DISABLED: "1",
        NETLIFY_AUTH_TOKEN: "",
        NETLIFY_SITE_ID: "",
        DATABASE_URL: "",
        LLM_API_KEY: "",
        SERVER_AI_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.on("error", (error) => {
    startupError = error;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      log = (log + chunk).slice(-6000);
    });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null)
      throw new Error("Netlify Dev exited before starting: " + log);
    try {
      ready = (
        await fetch(base + "/read-along/readalong.css", {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, "Netlify Dev did not start: " + log);
  for (const path of [
    "/speak",
    "/speak?article=existing&sentence=2",
    "/read-along/index.html",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert(
      html.includes("文章收件箱"),
      path + " must serve the speaking workspace",
    );
    assert(
      html.includes("/read-along/readalong.js"),
      path + " must load its script",
    );
    assert(!html.includes("这篇文章不在这里了"));
  }
  for (const path of [
    "/",
    "/read",
    "/read/another-article",
    "/api/health",
    "/listen",
    "/speak/practice",
  ]) {
    // There is no Next.js function in this CDN-only fixture: a 404 means the
    // alias did not capture the path, so the real deployment can route it on.
    assert.equal(
      (await fetch(base + path)).status,
      404,
      path + " must not become Read Along",
    );
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "readalong.articles",
      JSON.stringify([
        {
          id: "native-route-article",
          title: "Native route check",
          text: "First sentence. Second sentence. Third sentence.",
          index: 0,
        },
      ]),
    ),
  );
  await page.goto(base + "/speak?article=native-route-article&sentence=2");
  await page.locator(".sentence.active").waitFor();
  assert(
    (await page.locator(".sentence.active").innerText()).includes(
      "Third sentence.",
    ),
  );
  assert.equal(
    new URL(page.url()).searchParams.get("article"),
    "native-route-article",
  );
  assert.equal(
    await page.locator('nav [aria-current="page"]').innerText(),
    "口语",
  );
  await page.goto(base + "/speak");
  await page.locator(".sentence").first().waitFor();
  assert.equal(
    await page.locator("#practiceTitle").innerText(),
    "Native route check",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Netlify speaking alias: /speak serves Read Along and saved sentences; contextual reading, listening and other app/API routes remain separate.",
  );
} finally {
  await browser?.close();
  if (child?.pid) {
    const stopped = new Promise((resolve) => {
      child.once("close", resolve);
      setTimeout(resolve, 2000).unref();
    });
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    await stopped;
  }
  await rm(scratch, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
