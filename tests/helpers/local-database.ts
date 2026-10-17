import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

/** Integration fixtures never consume personal data or generation quotas. */
export async function temporaryDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error(
      "Integration tests require local PostgreSQL with CREATE DATABASE permission.",
    );
  const admin = new Client({ connectionString: url.href });
  if (!["localhost", "127.0.0.1", "::1"].includes(admin.host))
    throw new Error("Refusing a non-local resolved PostgreSQL host.");
  const name = `wordweave_integration_${randomUUID().replaceAll("-", "")}`;
  await admin.connect();
  let created = false;
  async function cleanup() {
    try {
      if (created) {
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        created = false;
      }
    } finally {
      await admin.end();
    }
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    await promisify(execFile)(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url.href },
        timeout: 30000,
      },
    );
    return { url: url.href, cleanup };
  } catch {
    await cleanup();
    throw new Error(
      "Temporary integration database setup failed. Check local PostgreSQL permissions and migrations.",
    );
  }
}
