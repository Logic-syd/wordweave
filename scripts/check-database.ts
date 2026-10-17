import "dotenv/config";
import { Client } from "pg";
import {
  databaseErrorMessage,
  getDatabaseErrorCode,
  readDatabaseConfig,
} from "../src/lib/database-config";

async function main() {
  let client: Client | undefined;
  try {
    const { connectionString, host, port } = readDatabaseConfig();
    // Deliberately omit credentials, database names, URL parameters and raw errors.
    console.info(`[database] target=${host}:${port}`);
    client = new Client({
      connectionString,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
    });
    await client.connect();
    if (process.argv.includes("--schema")) {
      await client.query('SELECT 1 FROM "public"."Article" LIMIT 1');
      console.info("[database] connection and Article table: ready");
    } else {
      await client.query("SELECT 1");
      console.info("[database] connection: ready");
    }
  } catch (error) {
    console.error(
      `[database] ${getDatabaseErrorCode(error)}: ${databaseErrorMessage(error)}`,
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}

void main();
