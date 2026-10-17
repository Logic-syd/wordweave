import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import {
  DatabaseConfigurationError,
  databaseErrorMessage,
  getDatabaseErrorCode,
  readDatabaseConfig,
} from "../src/lib/database-config";

afterEach(() => vi.unstubAllEnvs());

function configurationError(env: Readonly<Record<string, string | undefined>>) {
  try {
    readDatabaseConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseConfigurationError);
    return error;
  }
  throw new Error("Expected database configuration to be rejected");
}

describe("database connection configuration", () => {
  it("rejects missing configuration instead of falling back to pg defaults", () => {
    vi.stubEnv("PGHOST", "localhost");
    for (const DATABASE_URL of [undefined, "", " \n\t"]) {
      expect(getDatabaseErrorCode(configurationError({ DATABASE_URL }))).toBe(
        "DATABASE_URL_MISSING",
      );
    }
    expect(
      getDatabaseErrorCode(
        configurationError({ DATABASE_URL: "${{Postgres.DATABASE_URL}}" }),
      ),
    ).toBe("DATABASE_URL_UNRESOLVED");
  });

  it("reads the effective driver target without connecting or altering credentials", () => {
    const connect = vi.spyOn(Client.prototype, "connect");
    const connectionString =
      "postgresql://private-user:p%40ss%3Aword%2Fsecret@old.internal:5432/railway?host=postgres.railway.internal&port=5444&application_name=wordweave";
    expect(readDatabaseConfig({ DATABASE_URL: connectionString })).toEqual({
      connectionString,
      host: "postgres.railway.internal",
      port: 5444,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("blocks actual local targets on Railway while supporting local development", () => {
    const DATABASE_URL = "postgresql://test:fake@localhost:5432/wordweave";
    expect(readDatabaseConfig({ DATABASE_URL }).host).toBe("localhost");
    for (const host of [
      "localhost",
      "127.0.0.1",
      "127.8.9.10",
      "127.1",
      "2130706433",
      "0x7f000001",
      "0.0.0.0",
      "::1",
      "0:0:0:0:0:0:0:1",
      "::ffff:127.0.0.1",
    ]) {
      const error = configurationError({
        DATABASE_URL: `postgresql://test:fake@remote.internal/db?host=${encodeURIComponent(host)}`,
        RAILWAY_PROJECT_ID: "test-project",
      });
      expect(getDatabaseErrorCode(error)).toBe("DATABASE_URL_LOCAL_ON_RAILWAY");
    }
    expect(
      getDatabaseErrorCode(
        configurationError({ DATABASE_URL, RAILWAY_ENVIRONMENT_ID: "test" }),
      ),
    ).toBe("DATABASE_URL_LOCAL_ON_RAILWAY");
    expect(
      readDatabaseConfig({
        DATABASE_URL: `${DATABASE_URL}?host=postgres.railway.internal`,
        RAILWAY_PROJECT_ID: "test-project",
      }).host,
    ).toBe("postgres.railway.internal");
  });

  it("returns safe configuration errors without leaking invalid input", () => {
    for (const DATABASE_URL of [
      "not-a-url-private-secret",
      "https://private-user:private-secret@db.invalid/db",
      "postgresql:///db",
      "postgresql://private-user:private-secret@[invalid/db",
      "postgresql://private-user:private-secret@db.invalid/db?port=70000",
    ]) {
      const error = configurationError({ DATABASE_URL });
      expect(getDatabaseErrorCode(error)).toBe("DATABASE_URL_INVALID");
      expect(String(error)).not.toContain("private-secret");
      expect(String(error)).not.toContain("private-user");
      expect(databaseErrorMessage(error)).not.toContain(DATABASE_URL);
    }
  });
});

describe("safe database error diagnostics", () => {
  it("recognizes nested driver errors and never reuses their messages", () => {
    const error = {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: "28P01",
            originalMessage: "private-password-and-database-url",
          },
        },
      },
    };
    expect(getDatabaseErrorCode(error)).toBe("28P01");
    expect(databaseErrorMessage(error)).toContain("密码验证失败");
    expect(databaseErrorMessage(error)).not.toContain("private-password");
    expect(getDatabaseErrorCode({ cause: { code: "ECONNREFUSED" } })).toBe(
      "ECONNREFUSED",
    );
    expect(
      getDatabaseErrorCode({ cause: { kind: "DatabaseNotReachable" } }),
    ).toBe("P1001");
  });

  it("bounds traversal and ignores unknown codes, secret messages and throwing getters", () => {
    const circular: { cause?: unknown; code: string; message: string } = {
      code: "private-secret",
      message: "private-secret",
    };
    circular.cause = circular;
    const throwing = Object.defineProperty({}, "code", {
      get() {
        throw new Error("private-secret");
      },
    });
    for (const error of [circular, throwing, null, "private-secret"]) {
      expect(getDatabaseErrorCode(error)).toBe("DATABASE_ERROR");
      expect(databaseErrorMessage(error)).not.toContain("private-secret");
    }
  });
});
