/** Real production HTTP routes and an isolated local PostgreSQL database.
 * Models use a local fixture; this tests authentication and ownership, not AI quality.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { checkPublicBrowsing } from "./public-browsing.browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseName = `wordweave_auth_test_${randomUUID().replaceAll("-", "")}`;
const originalDatabaseUrl = process.env.DATABASE_URL;
const aliceToken = randomBytes(32).toString("hex");
const bobToken = randomBytes(32).toString("hex");
const legacyToken = randomBytes(32).toString("hex");
const source = "React batches state updates to avoid unnecessary re-renders.";
const checks = [];
let admin,
  database,
  modelServer,
  created = false,
  databaseUrl,
  appUrl;
let modelCalls = 0;
const applications = [];
const cookieValues = [];
const invitationTokens = [];
function safe(value) {
  let text = String(value);
  for (const secret of [
    aliceToken,
    bobToken,
    legacyToken,
    originalDatabaseUrl,
    databaseUrl,
    ...cookieValues,
    ...invitationTokens,
  ])
    if (secret) text = text.replaceAll(secret, "[redacted]");
  return text.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[database-url]");
}
function report(message) {
  checks.push(message);
  console.log(`✓ ${message}`);
}
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function until(action, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await action();
      if (result) return result;
    } catch (error) {
      if (error?.smokeFatal) throw error;
      /* retry until ready */
    }
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}
function spawnNode(args, env) {
  const process = spawn(globalThis.process.execPath, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [process.stdout, process.stderr])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-14000);
    });
  return { process, output: () => output };
}
async function start(env) {
  const reservation = createServer();
  await listen(reservation);
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const app = spawnNode(
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    env,
  );
  applications.push(app);
  const base = `http://127.0.0.1:${port}`;
  await until(
    async () =>
      (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }))
        .ok,
    "Next production server readiness",
  );
  return base;
}
async function request(
  route,
  { token, cookie, method = "GET", body, headers = {}, base = appUrl } = {},
) {
  const response = await fetch(`${base}${route}`, {
    method,
    redirect: "manual",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { response, data };
}
async function login(token, base = appUrl) {
  const result = await request("/api/auth/login", {
    base,
    method: "POST",
    body: { token },
    headers: { Origin: base },
  });
  assert.equal(
    result.response.status,
    200,
    `Login: ${safe(JSON.stringify(result.data))}`,
  );
  const cookies = result.response.headers.getSetCookie();
  assert.ok(cookies.length > 0);
  assert.ok(
    cookies.some(
      (cookie) => /httponly/i.test(cookie) && /samesite=lax/i.test(cookie),
    ),
  );
  const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");
  cookieValues.push(cookie);
  for (const part of cookie.split("; "))
    cookieValues.push(part.slice(part.indexOf("=") + 1));
  return cookie;
}
async function createArticle(cookie, title) {
  const result = await request("/api/articles", {
    cookie,
    method: "POST",
    headers: { Origin: appUrl },
    body: { title, mode: "tech", text: source, settings: {} },
  });
  assert.equal(result.response.status, 201, safe(JSON.stringify(result.data)));
  return result.data.id;
}
async function generate(cookie, id) {
  const result = await request(`/api/articles/${id}/generate`, {
    cookie,
    method: "POST",
    headers: { Origin: appUrl },
    body: {},
  });
  assert.ok(
    [200, 202].includes(result.response.status),
    safe(JSON.stringify(result.data)),
  );
  return until(async () => {
    const article = (await request(`/api/articles/${id}`, { cookie })).data;
    if (article.generationError)
      throw Object.assign(new Error(article.generationError), {
        smokeFatal: true,
      });
    return article.version ? article : false;
  }, "article generated");
}

try {
  if (!originalDatabaseUrl)
    throw new Error(
      "Set a local DATABASE_URL with CREATE DATABASE permission.",
    );
  const url = new URL(originalDatabaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Refusing non-local PostgreSQL for auth smoke.");
  await access(path.join(root, ".next/server/app/api/auth/login/route.js"));
  await access(path.join(root, ".next/server/app/api/invitations/route.js"));
  admin = new pg.Client({ connectionString: originalDatabaseUrl });
  if (!["localhost", "127.0.0.1", "::1"].includes(admin.host))
    throw new Error(
      "Refusing PostgreSQL host overrides that point outside localhost.",
    );
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  url.pathname = `/${databaseName}`;
  databaseUrl = url.href;
  database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "production",
    SEED_DEMOS: "false",
    TRIAL_ACCESS_TOKENS: JSON.stringify({
      personal: aliceToken,
      friend_anna: bobToken,
    }),
    EXTENSION_ACCESS_TOKEN: legacyToken,
    ADMIN_ACCESS_TOKEN: "",
    GENERATION_DAILY_LIMIT: "20",
    GENERATION_DAILY_CHAR_LIMIT: "120000",
    GENERATION_GLOBAL_DAILY_LIMIT: "100",
    GENERATION_GLOBAL_DAILY_CHAR_LIMIT: "600000",
    GENERATION_MAX_CONCURRENT: "2",
    GENERATION_DAILY_MODEL_CALL_LIMIT: "100",
  };
  const migration = spawnNode(
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    env,
  );
  assert.equal(
    (await once(migration.process, "exit"))[0],
    0,
    safe(migration.output()),
  );
  modelServer = createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    modelCalls++;
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const paragraphs = JSON.parse(JSON.parse(raw).messages[1].content).data
        .paragraphs;
      const data = {
        title: "HTTP 所有权测试",
        terms: [
          {
            id: "term",
            lemma: "avoid unnecessary re-renders",
            partOfSpeech: "phrase",
            meaning: "避免不必要的重新渲染（隔离测试）",
            grammar: {},
            explanation: "测试语境说明。",
            example: source,
            exampleTranslation:
              "React 批量处理状态更新，避免不必要的重新渲染。",
            category: "general",
          },
        ],
        paragraphs: paragraphs.map((paragraph) => ({
          id: paragraph.id,
          segments: [
            { type: "text", text: "React 批量处理状态更新，以 " },
            {
              type: "term",
              text: "avoid unnecessary re-renders",
              termId: "term",
              meaning: "避免不必要的重新渲染（隔离测试）",
              sentence: source,
            },
            { type: "text", text: "。" },
          ],
        })),
      };
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(data) },
            },
          ],
        }),
      );
    } catch {
      res
        .writeHead(500)
        .end(JSON.stringify({ error: "Local auth fixture error" }));
    }
  });
  const modelUrl = await listen(modelServer);
  Object.assign(env, {
    LLM_API_KEY: "local-auth-fixture",
    LLM_BASE_URL: `${modelUrl}/v1`,
    LLM_MODEL: "local-auth-fixture",
  });
  appUrl = await start(env);
  const oldInvite = `inv_${randomBytes(32).toString("base64url")}`;
  const oldSession = `ses_${randomBytes(32).toString("base64url")}`;
  invitationTokens.push(oldInvite, oldSession);
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  await database.query(
    'INSERT INTO "Invitation" (id, "ownerId", label, "tokenHash", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
    ["old-invite", "friend_saved", "Historical invitation", hash(oldInvite)],
  );
  await database.query(
    'INSERT INTO "InvitationSession" ("tokenHash", "invitationId", "expiresAt") VALUES ($1, $2, $3)',
    [hash(oldSession), "old-invite", new Date(Date.now() + 86400000)],
  );

  for (const route of [
    "/api/articles",
    "/api/vocabulary",
    "/api/generation/budget",
  ])
    assert.equal((await request(route)).response.status, 401);
  for (const token of ["invalid-test-token", bobToken, oldInvite]) {
    assert.equal(
      (await request("/api/auth/login", { method: "POST", body: { token } }))
        .response.status,
      401,
    );
    assert.equal(
      (await request("/api/articles", { token })).response.status,
      401,
    );
    assert.equal(
      (await request("/api/extension/status", { token })).response.status,
      401,
    );
  }
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      owner: "friend_anna",
      expiresAt: Date.now() + 86400000,
      nonce: "old-session",
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", bobToken)
    .update(`wordweave-session-v1.${payload}`)
    .digest("base64url");
  for (const value of [`${payload}.${signature}`, oldSession]) {
    const cookie = `wordweave_trial_session=${value}`;
    assert.equal(
      (await request("/api/articles", { cookie })).response.status,
      401,
    );
    assert.equal(
      (await request("/api/auth/session", { cookie })).data.authenticated,
      false,
    );
  }
  report(
    "Anonymous visitors, historical friend tokens and signed/opaque friend sessions cannot access private APIs",
  );

  const aliceCookie = await login(aliceToken);
  assert.equal(
    (await request("/api/auth/session", { cookie: aliceCookie })).data.ownerId,
    "personal",
  );
  assert.equal(
    (await request("/api/articles", { token: legacyToken })).response.status,
    200,
  );
  assert.equal(
    (await request("/api/articles", { cookie: `${aliceCookie}tampered` }))
      .response.status,
    401,
  );
  report(
    "Existing owner password, HttpOnly session and legacy owner credential remain usable; tampered cookies fail",
  );

  const aliceId = await createArticle(
    aliceCookie,
    "Owner private HTTP fixture",
  );
  // Retained historical data must not be reassigned to the personal owner.
  const historicalId = await createArticle(
    aliceCookie,
    "Historical friend private fixture",
  );
  await database.query('UPDATE "Article" SET "ownerId" = $1 WHERE id = $2', [
    "friend_anna",
    historicalId,
  ]);
  assert.equal(
    (await request(`/api/articles/${historicalId}`, { cookie: aliceCookie }))
      .response.status,
    404,
  );
  assert.equal(
    (await request(`/api/articles/${aliceId}`)).response.status,
    401,
  );
  const guestLibrary = await request("/library");
  assert.equal(guestLibrary.response.status, 200);
  assert.ok(!guestLibrary.data.includes("Owner private HTTP fixture"));
  assert.ok(!guestLibrary.data.includes("Historical friend private fixture"));
  assert.equal(
    (
      await request(`/api/articles/${aliceId}/generate`, {
        method: "POST",
        body: {},
      })
    ).response.status,
    401,
  );
  assert.equal(modelCalls, 0);
  await generate(aliceCookie, aliceId);
  assert.ok(modelCalls > 0);
  report(
    "Owner can save/generate privately; guests cannot consume model calls and historical friend records stay isolated",
  );

  assert.equal(
    (
      await request("/api/articles", {
        cookie: aliceCookie,
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: {},
      })
    ).response.status,
    403,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: { token: aliceToken },
      })
    ).response.status,
    403,
  );
  report("Cross-origin login and writes are rejected");

  const before = (await database.query('SELECT count(*) FROM "Invitation"'))
    .rows[0].count;
  for (const [route, method] of [
    ["/api/invitations", "GET"],
    ["/api/invitations", "POST"],
    ["/api/invitations/old-id", "PATCH"],
  ]) {
    const result = await request(route, {
      cookie: aliceCookie,
      method,
      ...(method !== "GET" ? { body: {} } : {}),
    });
    assert.equal(result.response.status, 410);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
  }
  assert.equal(
    (await database.query('SELECT count(*) FROM "Invitation"')).rows[0].count,
    before,
  );
  const retired = await request("/invites", { cookie: aliceCookie });
  assert.ok([307, 308].includes(retired.response.status));
  assert.equal(retired.response.headers.get("location"), "/");
  report(
    "Invitation page redirects home; retired management APIs return 410 without writing data",
  );

  report(await checkPublicBrowsing(appUrl, aliceToken));
  const loggedOut = await request("/api/auth/logout", {
    cookie: aliceCookie,
    method: "POST",
  });
  assert.equal(loggedOut.response.status, 200);
  assert.ok(
    loggedOut.response.headers
      .getSetCookie()
      .some((value) => /max-age=0/i.test(value)),
  );
  report("Logout clears the browser session");

  const legacyUrl = await start({
    ...env,
    TRIAL_ACCESS_TOKENS: "",
    ADMIN_ACCESS_TOKEN: "",
  });
  const legacyCookie = await login(legacyToken, legacyUrl);
  assert.equal(
    (
      await request(`/api/articles/${aliceId}`, {
        base: legacyUrl,
        cookie: legacyCookie,
      })
    ).response.status,
    200,
  );
  const beforeBudget = await request("/api/generation/budget", {
    cookie: aliceCookie,
  });
  assert.equal(beforeBudget.response.status, 200);
  assert.equal(beforeBudget.response.headers.get("cache-control"), "no-store");
  assert.equal(beforeBudget.data.generations.used, 1);
  assert.equal(beforeBudget.data.modelRequests.used, modelCalls);
  const limitEnv = { ...env, GENERATION_DAILY_LIMIT: "2" };
  const limitedUrl = await start(limitEnv);
  const limitedCookie = await login(aliceToken, limitedUrl);
  const nextId = await createArticle(aliceCookie, "Quota boundary fixture");
  const generated = await request(`/api/articles/${nextId}/generate`, {
    base: limitedUrl,
    cookie: limitedCookie,
    method: "POST",
    body: {},
  });
  assert.equal(generated.response.status, 200);
  const callsAtLimit = modelCalls;
  const previousVersion = (
    await request(`/api/articles/${aliceId}`, { cookie: aliceCookie })
  ).data.version.id;
  const denied = await request(`/api/articles/${aliceId}/generate`, {
    base: limitedUrl,
    cookie: limitedCookie,
    method: "POST",
    body: {},
  });
  assert.equal(denied.response.status, 429);
  assert.match(denied.data.error, /2 次生成额度/);
  assert.equal(modelCalls, callsAtLimit);
  assert.equal(
    (await request(`/api/articles/${aliceId}`, { cookie: aliceCookie })).data
      .version.id,
    previousVersion,
  );
  const restartedUrl = await start(limitEnv);
  assert.equal(
    (
      await request(`/api/articles/${aliceId}/generate`, {
        base: restartedUrl,
        token: aliceToken,
        method: "POST",
        body: {},
      })
    ).response.status,
    429,
  );
  assert.equal(modelCalls, callsAtLimit);
  const modelLimitedUrl = await start({
    ...env,
    GENERATION_DAILY_MODEL_CALL_LIMIT: String(callsAtLimit),
  });
  const modelDenied = await request(`/api/articles/${aliceId}/generate`, {
    base: modelLimitedUrl,
    token: aliceToken,
    method: "POST",
    body: {},
  });
  assert.equal(modelDenied.response.status, 429);
  assert.match(modelDenied.data.error, /模型请求额度/);
  assert.equal(modelCalls, callsAtLimit);
  report(
    "Daily generation and provider-request caps return 429 before model calls, survive process restart and preserve previous versions",
  );

  const closedUrl = await start({
    ...env,
    TRIAL_ACCESS_TOKENS: "",
    ADMIN_ACCESS_TOKEN: "",
    EXTENSION_ACCESS_TOKEN: "",
  });
  assert.equal(
    (await request("/api/articles", { base: closedUrl })).response.status,
    503,
  );
  for (const route of ["/", "/read/sample-cafe-v1"])
    assert.equal(
      (await request(route, { base: closedUrl })).response.status,
      200,
    );
  report(
    "Legacy-only owner deployments keep their data; unconfigured production serves samples with private APIs closed",
  );
  await mkdir(path.join(root, "test-results/auth"), { recursive: true });
  await writeFile(
    path.join(root, "test-results/auth/summary.json"),
    JSON.stringify(
      {
        status: "passed",
        checks,
        modelCalls,
        limitations: [
          "Real HTTP/PostgreSQL ownership checks; local mocked model output does not assess translation quality.",
          "Public browsing and the personal login dialog use a real Chromium browser and production cookie authentication.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nAuth HTTP smoke passed (${checks.length} checks).`);
} catch (error) {
  console.error(safe(error.stack ?? error));
  for (const app of applications)
    if (app.output()) console.error(safe(app.output()));
  process.exitCode = 1;
  await mkdir(path.join(root, "test-results/auth"), { recursive: true });
  await writeFile(
    path.join(root, "test-results/auth/summary.json"),
    JSON.stringify(
      { status: "failed", checks, modelCalls, error: safe(error.message) },
      null,
      2,
    ) + "\n",
  );
} finally {
  for (const app of applications)
    if (app.process.exitCode === null) {
      app.process.kill("SIGTERM");
      await Promise.race([once(app.process, "exit"), delay(2000)]);
      if (app.process.exitCode === null) app.process.kill("SIGKILL");
    }
  if (modelServer) {
    modelServer.closeAllConnections();
    await new Promise((resolve) => modelServer.close(resolve));
  }
  if (database) await database.end().catch(() => {});
  if (admin) {
    try {
      if (created)
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    } catch (error) {
      console.error(`Temporary DB cleanup failed: ${safe(error.message)}`);
      process.exitCode = 1;
    } finally {
      await admin.end();
    }
  }
}
