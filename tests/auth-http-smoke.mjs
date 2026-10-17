/** Real production HTTP routes and an isolated local PostgreSQL database.
 * Models use a local fixture; this tests authentication and ownership, not AI quality.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
function returnedToken(result) {
  const token = result.data.token;
  if (typeof token === "string") invitationTokens.push(token);
  return token;
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

  assert.equal((await request("/api/articles")).response.status, 401);
  assert.equal((await request("/api/vocabulary")).response.status, 401);
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { token: "invalid-test-token" },
      })
    ).response.status,
    401,
  );
  const aliceCookie = await login(aliceToken),
    bobCookie = await login(bobToken);
  assert.equal(
    (await request("/api/auth/session", { cookie: aliceCookie })).data.ownerId,
    "personal",
  );
  assert.equal(
    (await request("/api/auth/session", { cookie: bobCookie })).data.ownerId,
    "friend_anna",
  );
  report(
    "Anonymous/invalid requests are rejected; two distinct tokens create HttpOnly SameSite cookies with distinct server identities",
  );

  const aliceId = await createArticle(
    aliceCookie,
    "Alice private HTTP fixture",
  );
  const bobId = await createArticle(bobCookie, "Bob private HTTP fixture");
  const aliceList = (await request("/api/articles", { cookie: aliceCookie }))
    .data;
  const bobList = (await request("/api/articles", { cookie: bobCookie })).data;
  assert.ok(
    aliceList.some((article) => article.id === aliceId) &&
      !aliceList.some((article) => article.id === bobId),
  );
  assert.ok(
    bobList.some((article) => article.id === bobId) &&
      !bobList.some((article) => article.id === aliceId),
  );
  for (const [route, method, body] of [
    [`/api/articles/${aliceId}`, "GET", undefined],
    [`/api/articles/${aliceId}`, "DELETE", undefined],
    [`/api/articles/${aliceId}/progress`, "PATCH", { completed: true }],
    [`/api/articles/${aliceId}/generate`, "POST", {}],
  ])
    assert.equal(
      (
        await request(route, {
          cookie: bobCookie,
          method,
          body,
          headers: { Origin: appUrl },
        })
      ).response.status,
      404,
      `${method} ${route}`,
    );
  assert.equal(modelCalls, 0);
  report(
    "Article listing, direct reads, deletion, progress and generation enforce ownership; cross-owner generation never calls the model",
  );

  const aliceArticle = await generate(aliceCookie, aliceId);
  const wordId = aliceArticle.version.occurrences[0].vocabularyId;
  assert.equal(
    (
      await request(`/api/vocabulary/${wordId}`, {
        cookie: bobCookie,
        method: "PATCH",
        body: { favorite: true },
      })
    ).response.status,
    404,
  );
  const bobArticle = await generate(bobCookie, bobId);
  const bobWordId = bobArticle.version.occurrences[0].vocabularyId;
  assert.notEqual(
    bobWordId,
    wordId,
    "Identical expressions must have owner-scoped vocabulary records",
  );
  const favorite = await request(`/api/vocabulary/${wordId}`, {
    cookie: aliceCookie,
    method: "PATCH",
    headers: { Origin: appUrl },
    body: { favorite: true, status: "KNOWN" },
  });
  assert.equal(favorite.response.status, 200);
  const aliceWords = (await request("/api/vocabulary", { cookie: aliceCookie }))
    .data;
  const bobWords = (await request("/api/vocabulary", { cookie: bobCookie }))
    .data;
  const aliceWord = aliceWords.find((word) => word.id === wordId),
    bobWord = bobWords.find((word) => word.id === bobWordId);
  assert.equal(aliceWord.user.favorite, true);
  assert.equal(aliceWord.user.status, "KNOWN");
  assert.equal(bobWord.user.favorite, false);
  assert.equal(bobWord.user.status, "NEW");
  assert.ok(
    aliceWord.appearances.every((appearance) => appearance.articleId !== bobId),
  );
  assert.ok(
    bobWord.appearances.every((appearance) => appearance.articleId !== aliceId),
  );
  const progress = await request(`/api/articles/${aliceId}/progress`, {
    cookie: aliceCookie,
    method: "PATCH",
    headers: { Origin: appUrl },
    body: { paragraphId: "p0001", glossMode: "click", completed: true },
  });
  assert.equal(progress.response.status, 200);
  assert.equal(
    (await request(`/api/articles/${bobId}`, { cookie: bobCookie })).data
      .progress,
    null,
  );
  assert.equal(
    (
      await request(`/api/articles/${bobId}`, {
        cookie: bobCookie,
        method: "DELETE",
        headers: { Origin: appUrl },
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await request(`/api/articles/${aliceId}`, { cookie: aliceCookie }))
      .response.status,
    200,
  );
  report(
    "Identical expressions have separate owner-scoped vocabulary, favorites, mastery, occurrences and reading progress; deleting Bob's article preserves Alice's data",
  );

  const csrf = await request(`/api/vocabulary/${wordId}`, {
    cookie: aliceCookie,
    method: "PATCH",
    headers: {
      Origin: "https://untrusted.example",
      "Sec-Fetch-Site": "cross-site",
    },
    body: { favorite: false },
  });
  assert.equal(csrf.response.status, 403);
  assert.equal(
    (await request("/api/vocabulary", { cookie: aliceCookie })).data.find(
      (word) => word.id === wordId,
    ).user.favorite,
    true,
  );
  report(
    "Cross-origin cookie writes return 403 and do not change saved learning data",
  );

  const extension = await request("/api/extension/articles", {
    token: aliceToken,
    method: "POST",
    body: {
      title: "Alice extension fixture",
      sourceUrl: "https://example.com/fixture",
      retention: "medium",
      requestKey: randomUUID(),
      blocks: [{ id: "b0", markdown: source }],
    },
  });
  assert.equal(
    extension.response.status,
    202,
    safe(JSON.stringify(extension.data)),
  );
  const jobId = extension.data.id;
  assert.equal(
    (await request(`/api/extension/articles/${jobId}`, { token: bobToken }))
      .response.status,
    404,
  );
  assert.equal(
    (
      await request(`/api/extension/articles/${jobId}/retry`, {
        token: bobToken,
        method: "POST",
      })
    ).response.status,
    404,
  );
  const job = await until(async () => {
    const current = (
      await request(`/api/extension/articles/${jobId}`, { token: aliceToken })
    ).data;
    if (current.status === "failed")
      throw Object.assign(new Error(current.error), { smokeFatal: true });
    return current.status === "succeeded" ? current : false;
  }, "owner-scoped extension completion");
  assert.equal(job.article.id, jobId);
  assert.equal(
    (await request(`/api/articles/${jobId}`, { cookie: aliceCookie })).response
      .status,
    200,
  );
  assert.equal(
    (await request(`/api/articles/${jobId}`, { cookie: bobCookie })).response
      .status,
    404,
  );
  assert.equal(
    (await request(`/api/extension/articles/${jobId}`, { token: legacyToken }))
      .response.status,
    200,
  );
  assert.equal(
    (await request("/api/extension/status", { cookie: aliceCookie })).response
      .status,
    401,
  );
  report(
    "Extension Bearer identity matches website identity; other users cannot read/retry jobs and cookie-only extension access is rejected",
  );

  const budget = await database.query(
    'SELECT "ownerId", "count" FROM "GenerationUsage" WHERE "day" = $1',
    [new Date().toISOString().slice(0, 10)],
  );
  assert.equal(budget.rows.find((row) => row.ownerId === "personal").count, 2);
  assert.equal(
    budget.rows.find((row) => row.ownerId === "friend_anna").count,
    1,
  );
  assert.equal(budget.rows.find((row) => row.ownerId === "$global").count, 3);
  report(
    "Website and extension generations share persistent personal and site-wide usage limits",
  );

  const anonymousInvites = await request("/invites");
  assert.ok(
    [301, 302, 303, 307, 308].includes(anonymousInvites.response.status),
  );
  assert.match(
    anonymousInvites.response.headers.get("location") ?? "",
    /\/login/,
  );
  const friendInvites = await request("/invites", { cookie: bobCookie });
  assert.equal(friendInvites.response.status, 307);
  assert.equal(
    new URL(friendInvites.response.headers.get("location") ?? "", appUrl)
      .pathname,
    "/",
  );
  const administratorPage = await request("/invites", { cookie: aliceCookie });
  assert.equal(administratorPage.response.status, 200);
  assert.ok(!String(administratorPage.data).includes(aliceToken));
  report(
    "The invitation page redirects anonymous visitors to login and friends to the homepage, and renders only for the authenticated administrator",
  );

  for (const [route, method, body] of [
    ["/api/invitations", "GET", undefined],
    [
      "/api/invitations",
      "POST",
      { label: "Unauthorized", requestKey: randomUUID() },
    ],
    [
      "/api/invitations/unknown",
      "PATCH",
      { action: "revoke", requestKey: randomUUID() },
    ],
  ]) {
    assert.equal((await request(route, { method, body })).response.status, 401);
    assert.equal(
      (
        await request(route, {
          cookie: bobCookie,
          method,
          body,
          headers: { Origin: appUrl },
        })
      ).response.status,
      403,
    );
  }
  assert.equal(
    (await request("/api/invitations", { cookie: aliceCookie })).response
      .status,
    200,
  );
  for (const body of [
    { label: "", requestKey: randomUUID() },
    { label: "x".repeat(61), requestKey: randomUUID() },
    { label: "Friend", requestKey: "not-a-uuid" },
  ])
    assert.equal(
      (
        await request("/api/invitations", {
          cookie: aliceCookie,
          method: "POST",
          headers: { Origin: appUrl },
          body,
        })
      ).response.status,
      400,
    );
  assert.equal(
    (
      await request("/api/invitations", {
        cookie: aliceCookie,
        method: "POST",
        headers: {
          Origin: "https://untrusted.example",
          "Sec-Fetch-Site": "cross-site",
        },
        body: { label: "Cross-site", requestKey: randomUUID() },
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await database.query('SELECT count(*)::int AS count FROM "Invitation"'))
      .rows[0].count,
    0,
  );
  report(
    "Invitation management rejects anonymous users (401), friends (403), cross-site writes and invalid labels/request keys",
  );

  const createKey = randomUUID();
  const creation = await Promise.all(
    Array.from({ length: 3 }, () =>
      request("/api/invitations", {
        cookie: aliceCookie,
        method: "POST",
        headers: { Origin: appUrl },
        body: { label: "网页邀请测试朋友", requestKey: createKey },
      }),
    ),
  );
  for (const result of creation) {
    returnedToken(result);
    assert.equal(
      result.response.status,
      201,
      safe(JSON.stringify(result.data)),
    );
    assert.equal(result.response.headers.get("cache-control"), "no-store");
  }
  const issued = creation.filter(
    (result) => typeof result.data.token === "string",
  );
  assert.equal(
    issued.length,
    1,
    "Concurrent create replay must reveal only one raw token",
  );
  assert.equal(
    creation.filter(
      (result) => result.data.replayed && result.data.token === null,
    ).length,
    2,
  );
  assert.equal(
    new Set(creation.map((result) => result.data.invitation.id)).size,
    1,
  );
  const invitation = issued[0].data.invitation;
  const firstToken = issued[0].data.token;
  assert.match(firstToken, /^inv_[A-Za-z0-9_-]{43}$/);
  assert.equal(invitation.active, true);
  assert.notEqual(invitation.ownerId, "personal");
  assert.equal(
    (await database.query('SELECT count(*)::int AS count FROM "Invitation"'))
      .rows[0].count,
    1,
  );
  const stored = (
    await database.query('SELECT * FROM "Invitation" WHERE id = $1', [
      invitation.id,
    ])
  ).rows[0];
  assert.equal(
    stored.tokenHash,
    createHash("sha256").update(firstToken).digest("hex"),
  );
  assert.ok(!JSON.stringify(stored).includes(firstToken));
  const list = (await request("/api/invitations", { cookie: aliceCookie }))
    .data;
  assert.equal(list.invitations.length, 1);
  assert.ok(!JSON.stringify(list).includes(firstToken));
  assert.doesNotMatch(JSON.stringify(list), /tokenHash|"token"/);
  assert.equal(
    (
      await request("/api/invitations", {
        cookie: aliceCookie,
        method: "POST",
        headers: { Origin: appUrl },
        body: { label: "Different payload", requestKey: createKey },
      })
    ).response.status,
    409,
  );
  report(
    "Concurrent invitation creation is idempotent, returns the raw code once, stores only its SHA-256 hash and never exposes tokens in the list",
  );

  const guestCookie = await login(firstToken);
  const opaqueSession = guestCookie.split(";")[0].split("=")[1];
  assert.match(opaqueSession, /^ses_[A-Za-z0-9_-]{43}$/);
  const guestSession = (
    await request("/api/auth/session", { cookie: guestCookie })
  ).data;
  assert.equal(guestSession.ownerId, invitation.ownerId);
  assert.equal(guestSession.isAdmin, false);
  const sessionRows = (
    await database.query(
      'SELECT * FROM "InvitationSession" WHERE "invitationId" = $1',
      [invitation.id],
    )
  ).rows;
  assert.equal(sessionRows.length, 1);
  assert.equal(
    sessionRows[0].tokenHash,
    createHash("sha256").update(opaqueSession).digest("hex"),
  );
  assert.ok(!JSON.stringify(sessionRows).includes(opaqueSession));
  assert.equal(
    (await request("/api/invitations", { cookie: guestCookie })).response
      .status,
    403,
  );
  assert.equal(
    (await request(`/api/articles/${aliceId}`, { token: firstToken })).response
      .status,
    404,
  );
  const guestArticleId = await createArticle(
    guestCookie,
    "Invited friend retains this article",
  );
  const guestArticle = await generate(guestCookie, guestArticleId);
  const guestWordId = guestArticle.version.occurrences[0].vocabularyId;
  assert.equal(
    (
      await request(`/api/vocabulary/${guestWordId}`, {
        cookie: guestCookie,
        method: "PATCH",
        body: { favorite: true, status: "LEARNING" },
        headers: { Origin: appUrl },
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request(`/api/articles/${guestArticleId}/progress`, {
        cookie: guestCookie,
        method: "PATCH",
        body: { paragraphId: "p0001", glossMode: "click", view: "original" },
        headers: { Origin: appUrl },
      })
    ).response.status,
    200,
  );
  report(
    "A webpage-issued code authenticates through opaque hashed sessions and Bearer, with its own isolated articles and learning data",
  );

  const rotateKey = randomUUID();
  const rotations = await Promise.all(
    Array.from({ length: 2 }, () =>
      request(`/api/invitations/${invitation.id}`, {
        cookie: aliceCookie,
        method: "PATCH",
        headers: { Origin: appUrl },
        body: { action: "rotate", requestKey: rotateKey },
      }),
    ),
  );
  for (const result of rotations) {
    returnedToken(result);
    assert.equal(
      result.response.status,
      200,
      safe(JSON.stringify(result.data)),
    );
  }
  const rotated = rotations.filter(
    (result) => typeof result.data.token === "string",
  );
  assert.equal(rotated.length, 1);
  assert.equal(
    rotations.filter(
      (result) => result.data.replayed && result.data.token === null,
    ).length,
    1,
  );
  const secondToken = rotated[0].data.token;
  assert.notEqual(secondToken, firstToken);
  assert.equal(rotated[0].data.invitation.ownerId, invitation.ownerId);
  assert.equal(
    (await request("/api/articles", { cookie: guestCookie })).response.status,
    401,
  );
  assert.equal(
    (await request("/api/extension/status", { token: firstToken })).response
      .status,
    401,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { token: firstToken },
      })
    ).response.status,
    401,
  );
  assert.equal(
    (
      await database.query(
        'SELECT count(*)::int AS count FROM "InvitationSession" WHERE "invitationId" = $1',
        [invitation.id],
      )
    ).rows[0].count,
    0,
  );
  const rotatedCookie = await login(secondToken);
  assert.equal(
    (await request("/api/auth/session", { cookie: rotatedCookie })).data
      .ownerId,
    invitation.ownerId,
  );
  const retained = (
    await request(`/api/articles/${guestArticleId}`, { cookie: rotatedCookie })
  ).data;
  assert.equal(retained.id, guestArticleId);
  assert.equal(retained.progress.glossMode, "click");
  assert.equal(retained.progress.view, "original");
  assert.equal(
    (await request("/api/vocabulary", { cookie: rotatedCookie })).data.find(
      (word) => word.id === guestWordId,
    ).user.favorite,
    true,
  );
  const lateCreateReplay = await request("/api/invitations", {
    cookie: aliceCookie,
    method: "POST",
    headers: { Origin: appUrl },
    body: { label: "网页邀请测试朋友", requestKey: createKey },
  });
  assert.equal(lateCreateReplay.data.token, null);
  assert.equal(lateCreateReplay.data.replayed, true);
  assert.equal(
    (await request("/api/extension/status", { token: secondToken })).response
      .status,
    200,
  );
  report(
    "Code rotation is idempotent and immediately invalidates old cookies/Bearer, while the new code keeps the same articles, favorites and reading progress",
  );

  const revokeKey = randomUUID();
  const revoked = await request(`/api/invitations/${invitation.id}`, {
    cookie: aliceCookie,
    method: "PATCH",
    headers: { Origin: appUrl },
    body: { action: "revoke", requestKey: revokeKey },
  });
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.data.token, null);
  assert.equal(revoked.data.invitation.active, false);
  assert.equal(
    (await request("/api/articles", { cookie: rotatedCookie })).response.status,
    401,
  );
  assert.equal(
    (await request("/api/extension/status", { token: secondToken })).response
      .status,
    401,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { token: secondToken },
      })
    ).response.status,
    401,
  );
  const revokeReplay = await request(`/api/invitations/${invitation.id}`, {
    cookie: aliceCookie,
    method: "PATCH",
    headers: { Origin: appUrl },
    body: { action: "revoke", requestKey: revokeKey },
  });
  assert.equal(revokeReplay.data.replayed, true);
  const oldRotateReplay = await request(`/api/invitations/${invitation.id}`, {
    cookie: aliceCookie,
    method: "PATCH",
    headers: { Origin: appUrl },
    body: { action: "rotate", requestKey: rotateKey },
  });
  assert.equal(oldRotateReplay.data.token, null);
  assert.equal(oldRotateReplay.data.invitation.active, false);
  assert.equal(
    (await request("/api/extension/status", { token: secondToken })).response
      .status,
    401,
  );
  const reactivated = await request(`/api/invitations/${invitation.id}`, {
    cookie: aliceCookie,
    method: "PATCH",
    headers: { Origin: appUrl },
    body: { action: "rotate", requestKey: randomUUID() },
  });
  const thirdToken = returnedToken(reactivated);
  assert.equal(reactivated.response.status, 200);
  assert.equal(reactivated.data.invitation.ownerId, invitation.ownerId);
  assert.equal(reactivated.data.invitation.active, true);
  const restoredCookie = await login(thirdToken);
  const secondSession = await login(thirdToken);
  assert.equal(
    (
      await request(`/api/articles/${guestArticleId}`, {
        cookie: restoredCookie,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request("/api/auth/logout", {
        cookie: restoredCookie,
        method: "POST",
        headers: { Origin: appUrl },
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await request("/api/articles", { cookie: restoredCookie })).response
      .status,
    401,
  );
  assert.equal(
    (await request("/api/articles", { cookie: secondSession })).response.status,
    200,
  );
  assert.equal(
    (await request("/api/extension/status", { token: thirdToken })).response
      .status,
    200,
  );
  assert.equal(
    (await request("/api/auth/session", { cookie: bobCookie })).data.ownerId,
    "friend_anna",
  );
  assert.equal(
    (await request("/api/auth/session", { cookie: aliceCookie })).data.ownerId,
    "personal",
  );
  report(
    "Revocation immediately blocks active sessions and codes; replay cannot undo it, new rotation restores the same data, and logout revokes only its own session without affecting legacy users",
  );

  const legacyOnlyUrl = await start({
    ...env,
    TRIAL_ACCESS_TOKENS: "",
    ADMIN_ACCESS_TOKEN: "",
  });
  const legacyOnlyCookie = await login(legacyToken, legacyOnlyUrl);
  assert.equal(
    (
      await request("/api/auth/session", {
        cookie: legacyOnlyCookie,
        base: legacyOnlyUrl,
      })
    ).data.ownerId,
    "personal",
  );
  assert.equal(
    (
      await request("/api/invitations", {
        cookie: legacyOnlyCookie,
        base: legacyOnlyUrl,
      })
    ).response.status,
    200,
  );
  const legacyCreated = await request("/api/invitations", {
    cookie: legacyOnlyCookie,
    base: legacyOnlyUrl,
    method: "POST",
    headers: { Origin: legacyOnlyUrl },
    body: {
      label: "Legacy administrator invitation",
      requestKey: randomUUID(),
    },
  });
  returnedToken(legacyCreated);
  assert.equal(
    legacyCreated.response.status,
    201,
    safe(JSON.stringify(legacyCreated.data)),
  );
  report(
    "Production with only the existing EXTENSION_ACCESS_TOKEN can log in as administrator and create website invitations without changing Railway variables",
  );

  const closedUrl = await start({
    ...env,
    TRIAL_ACCESS_TOKENS: "",
    EXTENSION_ACCESS_TOKEN: "",
    ADMIN_ACCESS_TOKEN: "",
  });
  assert.equal(
    (await request("/api/articles", { token: legacyToken, base: closedUrl }))
      .response.status,
    503,
  );
  assert.equal(
    (
      await request("/api/extension/status", {
        token: legacyToken,
        base: closedUrl,
      })
    ).response.status,
    503,
  );
  assert.equal(
    (await request("/api/articles", { token: thirdToken, base: closedUrl }))
      .response.status,
    503,
  );
  report("Production with no configured administrator credential fails closed");
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
          "Cookie handling is tested through HTTP; browser login UI is covered separately.",
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
