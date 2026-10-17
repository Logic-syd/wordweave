import { isIP } from "node:net";
import { Client } from "pg";

const configurationMessages = {
  DATABASE_URL_MISSING:
    "未设置 DATABASE_URL。请在应用服务中引用 PostgreSQL 的 DATABASE_URL，然后重新部署。",
  DATABASE_URL_UNRESOLVED:
    "DATABASE_URL 的变量引用尚未展开。请检查引用的 PostgreSQL 服务和变量名，然后应用变更并重新部署。",
  DATABASE_URL_INVALID:
    "DATABASE_URL 格式无效。请使用完整的 PostgreSQL 连接地址或正确的 Railway 变量引用。",
  DATABASE_URL_LOCAL_ON_RAILWAY:
    "Railway 中的 DATABASE_URL 指向本机地址。请引用同项目 PostgreSQL 服务的 DATABASE_URL，然后重新部署。",
} as const;

type ConfigurationCode = keyof typeof configurationMessages;

export class DatabaseConfigurationError extends Error {
  constructor(public readonly code: ConfigurationCode) {
    super(configurationMessages[code]);
    this.name = "DatabaseConfigurationError";
  }
}

function isLoopback(host: string) {
  let normalized = host.trim().toLowerCase().replace(/\.$/, "");
  normalized = normalized.replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  if (/^[\da-fx.]+$/.test(normalized)) {
    try {
      // Normalize numeric IPv4 spellings such as 127.1 and 2130706433.
      normalized = new URL(`http://${normalized}/`).hostname;
    } catch {
      // Other hostnames are left for the driver's normal DNS handling.
    }
  }
  if (isIP(normalized) === 4) {
    return normalized.startsWith("127.") || normalized === "0.0.0.0";
  }
  if (isIP(normalized) === 6) {
    normalized = new URL(`http://[${normalized}]/`).hostname.slice(1, -1);
    return (
      normalized === "::1" ||
      normalized === "::" ||
      /^::ffff:7f[\da-f]{2}:[\da-f]+$/.test(normalized) ||
      normalized === "::ffff:0:0"
    );
  }
  return false;
}

export function readDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): {
  connectionString: string;
  host: string;
  port: number;
} {
  const connectionString = env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new DatabaseConfigurationError("DATABASE_URL_MISSING");
  }
  if (connectionString.includes("${{")) {
    throw new DatabaseConfigurationError("DATABASE_URL_UNRESOLVED");
  }

  let client: Client;
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
      throw new DatabaseConfigurationError("DATABASE_URL_INVALID");
    }
    // Construction parses driver defaults and ?host=/port= overrides without
    // opening a connection. Never log the client or the original parser error.
    client = new Client({ connectionString });
    if (
      !client.host.trim() ||
      !Number.isInteger(client.port) ||
      client.port < 1 ||
      client.port > 65535
    ) {
      throw new DatabaseConfigurationError("DATABASE_URL_INVALID");
    }
  } catch {
    throw new DatabaseConfigurationError("DATABASE_URL_INVALID");
  }

  if (
    (env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID) &&
    isLoopback(client.host)
  ) {
    throw new DatabaseConfigurationError("DATABASE_URL_LOCAL_ON_RAILWAY");
  }
  return { connectionString, host: client.host, port: client.port };
}

const errorMessages = {
  ...configurationMessages,
  ECONNREFUSED:
    "数据库拒绝连接。请确认 PostgreSQL 正在运行，核对应用服务的数据库地址和端口，并在修改变量后重新部署。",
  ENOTFOUND:
    "无法解析数据库地址。请核对 DATABASE_URL 引用，并确认数据库和应用位于同一 Railway 项目环境。",
  EAI_AGAIN: "数据库地址暂时无法解析。请确认数据库服务可用，稍后重试。",
  ETIMEDOUT:
    "数据库连接超时。请检查 PostgreSQL 状态及应用与数据库之间的网络连接。",
  P1000:
    "数据库身份验证失败。请更新应用服务的 DATABASE_URL 引用，然后重新部署。",
  P1001:
    "无法连接数据库。请检查 PostgreSQL 状态，以及应用服务的 DATABASE_URL 地址和端口。",
  P2021:
    "数据库缺少应用数据表。请执行 npm run deploy:prepare，确认迁移成功后重新部署。",
  "28P01":
    "数据库密码验证失败。请更新应用服务的 DATABASE_URL 引用，然后重新部署。",
  "3D000":
    "连接指定的数据库不存在。请核对 DATABASE_URL 引用是否指向正确的 PostgreSQL 数据库。",
  "42P01":
    "数据库缺少应用数据表。请执行 npm run deploy:prepare，确认迁移成功后重新部署。",
  DATABASE_ERROR:
    "数据库暂时不可用。请检查数据库服务、应用连接配置与迁移日志。",
} as const;

type DatabaseErrorCode = keyof typeof errorMessages;

function readErrorField(value: object, field: string): unknown {
  try {
    return (value as Record<string, unknown>)[field];
  } catch {
    return undefined;
  }
}

export function getDatabaseErrorCode(error: unknown): DatabaseErrorCode {
  const queue = [{ value: error, depth: 0 }];
  const seen = new Set<object>();
  for (let index = 0; index < queue.length && index < 32; index++) {
    const { value, depth } = queue[index];
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    for (const field of ["code", "originalCode"]) {
      const code = readErrorField(value, field);
      if (typeof code === "string" && Object.hasOwn(errorMessages, code)) {
        return code as DatabaseErrorCode;
      }
    }
    const kind = readErrorField(value, "kind");
    if (kind === "DatabaseNotReachable") return "P1001";
    if (kind === "SocketTimeout") return "ETIMEDOUT";
    if (depth < 6) {
      for (const field of ["cause", "meta", "driverAdapterError"]) {
        queue.push({ value: readErrorField(value, field), depth: depth + 1 });
      }
    }
  }
  return "DATABASE_ERROR";
}

export function databaseErrorMessage(error: unknown): string {
  return errorMessages[getDatabaseErrorCode(error)];
}
