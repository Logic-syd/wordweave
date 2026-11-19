import "dotenv/config";
import { spawnSync } from "node:child_process";
if (!process.env.DATABASE_URL?.trim()) {
  console.info(
    "[start] Public BYOK website: browser storage, no database migration needed.",
  );
} else {
  // Existing private records are retained; migrate only a configured database.
  const result = spawnSync("bash", ["scripts/railway-predeploy.sh"], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const check = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/check-database.ts", "--schema"],
    { stdio: "inherit", env: process.env },
  );
  process.exit(check.status ?? 1);
}
