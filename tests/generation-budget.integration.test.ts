// Real concurrent PostgreSQL transactions in a temporary local database. This
// never deletes records from the app's configured database or a non-local host.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { acquireGenerationPermit } from "../src/lib/generation-budget";

const isolated = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("../src/lib/db", () => ({
  get db() {
    return isolated.db;
  },
}));
const databaseName = `wordweave_budget_test_${randomUUID().replaceAll("-", "")}`;
let admin: Client | undefined;
let created = false;
const config = {
  GENERATION_DAILY_LIMIT: "20",
  GENERATION_DAILY_CHAR_LIMIT: "120000",
  GENERATION_GLOBAL_DAILY_LIMIT: "100",
  GENERATION_GLOBAL_DAILY_CHAR_LIMIT: "600000",
  GENERATION_MAX_CONCURRENT: "2",
};
function input(ownerId = "alice", inputChars = 100) {
  return { ownerId, articleId: randomUUID(), token: randomUUID(), inputChars };
}
async function finish(ownerId = "alice", inputChars = 100) {
  const release = await acquireGenerationPermit(input(ownerId, inputChars));
  await release();
}
async function usage(
  ownerId: string,
  day = new Date().toISOString().slice(0, 10),
) {
  return isolated.db.generationUsage.findUniqueOrThrow({
    where: { ownerId_day: { ownerId, day } },
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Budget integration requires a local DATABASE_URL with CREATE DATABASE permission.",
    );
  const url = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error(
      "Refusing to create a budget test database on a non-local host.",
    );
  admin = new Client({ connectionString: url.href });
  if (!["localhost", "127.0.0.1", "::1"].includes(admin.host))
    throw new Error(
      "Refusing a PostgreSQL connection whose resolved driver host is non-local.",
    );
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  url.pathname = `/${databaseName}`;
  try {
    await promisify(execFile)(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.href },
        timeout: 30000,
      },
    );
  } catch {
    throw new Error(
      "Could not migrate temporary budget test database; run prisma generate and check migration files.",
    );
  }
  isolated.db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
}, 45000);
beforeEach(async () => {
  for (const [name, value] of Object.entries(config)) vi.stubEnv(name, value);
  await isolated.db.generationPermit.deleteMany();
  await isolated.db.generationUsage.deleteMany();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (isolated.db) await isolated.db.$disconnect();
  if (admin) {
    try {
      if (created)
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
}, 20000);

describe("persistent generation quotas and concurrent PostgreSQL leases", () => {
  it("atomically permits one job per person and two site-wide across concurrent transactions", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => acquireGenerationPermit(input())),
    );
    const granted = attempts.filter((entry) => entry.status === "fulfilled");
    expect(granted).toHaveLength(1);
    for (const denied of attempts.filter(
      (entry) => entry.status === "rejected",
    ))
      expect(denied.reason).toMatchObject({ status: 429 });
    const bob = await acquireGenerationPermit(input("bob"));
    await expect(acquireGenerationPermit(input("carol"))).rejects.toMatchObject(
      { status: 429 },
    );
    expect(await usage("alice")).toMatchObject({ count: 1, inputChars: 100 });
    expect(await usage("$global")).toMatchObject({ count: 2, inputChars: 200 });
    await Promise.all([granted[0].value(), bob()]);
    const wave = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        acquireGenerationPermit(input(`owner-${index}`)),
      ),
    );
    expect(wave.filter((entry) => entry.status === "fulfilled")).toHaveLength(
      2,
    );
    expect(await usage("$global")).toMatchObject({ count: 4, inputChars: 400 });
    await Promise.all(
      wave.flatMap((entry) =>
        entry.status === "fulfilled" ? [entry.value()] : [],
      ),
    );
  });

  it("does not double-count an active token and never reuses a released token for an uncounted model call", async () => {
    const request = input();
    const releases = await Promise.all(
      Array.from({ length: 6 }, () => acquireGenerationPermit(request)),
    );
    expect(await usage("alice")).toMatchObject({ count: 1, inputChars: 100 });
    expect(await isolated.db.generationPermit.count()).toBe(1);
    await expect(
      acquireGenerationPermit({ ...request, ownerId: "bob" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      acquireGenerationPermit({ ...request, articleId: "different-article" }),
    ).rejects.toMatchObject({ status: 409 });
    await Promise.all(releases.map((release) => release()));
    await expect(acquireGenerationPermit(request)).rejects.toMatchObject({
      status: 409,
    });
    await finish();
    expect(await usage("alice")).toMatchObject({ count: 2, inputChars: 200 });
  });

  it("keeps daily charges after release/expiry and uses a new token for an explicitly paid retry", async () => {
    const request = input();
    await acquireGenerationPermit(request);
    const permit = await isolated.db.generationPermit.findUniqueOrThrow({
      where: { token: request.token },
    });
    expect(
      permit.expiresAt.getTime() - permit.createdAt.getTime(),
    ).toBeGreaterThan(350000);
    // PostgreSQL NOW() is transaction-start time, slightly before lock acquisition.
    expect(
      permit.expiresAt.getTime() - permit.createdAt.getTime(),
    ).toBeLessThan(370000);
    await isolated.db.generationPermit.update({
      where: { token: request.token },
      data: { expiresAt: new Date(0) },
    });
    await expect(acquireGenerationPermit(request)).rejects.toMatchObject({
      status: 409,
    });
    const retry = await acquireGenerationPermit({
      ...request,
      token: randomUUID(),
    });
    await retry();
    expect(await usage("alice")).toMatchObject({ count: 2, inputChars: 200 });
    expect(await usage("$global")).toMatchObject({ count: 2, inputChars: 200 });
    expect(await isolated.db.generationPermit.count()).toBe(2);
  });

  it("enforces each person's UTC-day count without charging denied requests", async () => {
    vi.stubEnv("GENERATION_DAILY_LIMIT", "2");
    await finish();
    await finish();
    await expect(acquireGenerationPermit(input())).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("UTC"),
    });
    expect(await usage("alice")).toMatchObject({ count: 2 });
    await finish("bob");
    expect(await usage("$global")).toMatchObject({ count: 3 });
    // Past-day usage is retained and does not consume today's allowance.
    await isolated.db.generationUsage.create({
      data: {
        ownerId: "carol",
        day: "2000-01-01",
        count: 1000,
        inputChars: 999999,
      },
    });
    await finish("carol");
    expect(await usage("carol")).toMatchObject({ count: 1 });
    expect(await usage("carol", "2000-01-01")).toMatchObject({ count: 1000 });
  });

  it("enforces both personal and site-wide input-character budgets and the global count", async () => {
    vi.stubEnv("GENERATION_DAILY_CHAR_LIMIT", "150");
    vi.stubEnv("GENERATION_GLOBAL_DAILY_CHAR_LIMIT", "250");
    await finish("alice", 150);
    await expect(
      acquireGenerationPermit(input("alice", 1)),
    ).rejects.toMatchObject({ status: 429 });
    await finish("bob", 100);
    await expect(
      acquireGenerationPermit(input("carol", 1)),
    ).rejects.toMatchObject({ status: 429 });
    expect(await usage("$global")).toMatchObject({ count: 2, inputChars: 250 });
    vi.stubEnv("GENERATION_GLOBAL_DAILY_CHAR_LIMIT", "1000");
    vi.stubEnv("GENERATION_GLOBAL_DAILY_LIMIT", "2");
    await expect(
      acquireGenerationPermit(input("carol", 1)),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("次数"),
    });
    expect(
      await isolated.db.generationUsage.count({ where: { ownerId: "carol" } }),
    ).toBe(0);
  });

  it("fails closed for invalid limits and allows zero to pause generation without changing usage", async () => {
    for (const value of ["-1", "1.5", "NaN", "1001"]) {
      vi.stubEnv("GENERATION_DAILY_LIMIT", value);
      await expect(acquireGenerationPermit(input())).rejects.toMatchObject({
        status: 503,
      });
    }
    vi.stubEnv("GENERATION_DAILY_LIMIT", "0");
    await expect(acquireGenerationPermit(input())).rejects.toMatchObject({
      status: 429,
    });
    expect(await isolated.db.generationUsage.count()).toBe(0);
    vi.stubEnv("GENERATION_DAILY_LIMIT", "20");
    await expect(
      acquireGenerationPermit(input("alice", -1)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      acquireGenerationPermit(input("alice", 1.5)),
    ).rejects.toMatchObject({ status: 400 });
    expect(await isolated.db.generationPermit.count()).toBe(0);
  });
});
