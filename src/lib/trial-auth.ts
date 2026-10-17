import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

type Environment = Readonly<Record<string, string | undefined>>;
export const SESSION_COOKIE = "wordweave_trial_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const validToken = (token: unknown): token is string =>
  typeof token === "string" && /^[\x21-\x7e]{32,512}$/.test(token);
const configurationMessage =
  "管理员尚未配置有效的 TRIAL_ACCESS_TOKENS。请配置独立邀请码并重新部署。";

type TrialConfiguration = {
  enabled: boolean;
  tokens: ReadonlyMap<string, string>;
  legacyToken: string | null;
};

export function trialConfiguration(
  env: Environment = process.env,
): TrialConfiguration {
  const raw = env.TRIAL_ACCESS_TOKENS;
  const legacyToken = validToken(env.EXTENSION_ACCESS_TOKEN?.trim())
    ? env.EXTENSION_ACCESS_TOKEN!.trim()
    : null;
  if (!raw?.trim()) {
    if (env.NODE_ENV === "production")
      throw new AppError(configurationMessage, 503);
    return { enabled: false, tokens: new Map(), legacyToken };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AppError(configurationMessage, 503);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new AppError(configurationMessage, 503);
  const entries = Object.entries(data);
  const seen = new Set<string>();
  if (!entries.length || entries.length > 100)
    throw new AppError(configurationMessage, 503);
  for (const [owner, token] of entries) {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(owner) ||
      !validToken(token) ||
      seen.has(token)
    )
      throw new AppError(configurationMessage, 503);
    if (legacyToken === token && owner !== "personal")
      throw new AppError(configurationMessage, 503);
    seen.add(token);
  }
  return {
    enabled: true,
    tokens: new Map(entries as [string, string][]),
    legacyToken,
  };
}

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ownerForToken(
  token: string | undefined,
  env: Environment = process.env,
) {
  const config = trialConfiguration(env);
  if (!validToken(token)) return null;
  for (const [owner, expected] of config.tokens) {
    if (equalSecret(token, expected)) return owner;
  }
  if (
    config.legacyToken &&
    (!config.enabled || config.tokens.has("personal")) &&
    equalSecret(token, config.legacyToken)
  )
    return "personal";
  return null;
}

function sessionKey(owner: string, env: Environment) {
  return trialConfiguration(env).tokens.get(owner);
}

export function createSession(
  owner: string,
  env: Environment = process.env,
  now = Date.now(),
) {
  const key = sessionKey(owner, env);
  if (!key) throw new AppError(configurationMessage, 503);
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      owner,
      expiresAt: now + SESSION_SECONDS * 1000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", key)
    .update(`wordweave-session-v1.${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function ownerForSession(
  cookie: string | undefined,
  env: Environment = process.env,
  now = Date.now(),
) {
  const config = trialConfiguration(env);
  if (!cookie || cookie.length > 2048 || !/^[\w-]+\.[\w-]+$/.test(cookie))
    return null;
  const [payload, signature] = cookie.split(".");
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const session = data as Record<string, unknown>;
  if (
    session.version !== 1 ||
    typeof session.owner !== "string" ||
    typeof session.expiresAt !== "number" ||
    session.expiresAt <= now ||
    session.expiresAt > now + SESSION_SECONDS * 1000 ||
    typeof session.nonce !== "string"
  )
    return null;
  const key = config.tokens.get(session.owner);
  if (!key) return null;
  const expected = createHmac("sha256", key)
    .update(`wordweave-session-v1.${payload}`)
    .digest("base64url");
  return equalSecret(signature, expected) ? session.owner : null;
}

export function cookieValue(headers: Headers) {
  const cookie = headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.slice(SESSION_COOKIE.length + 1);
}

export function requireRequestOwner(
  request: Request,
  bearerOnly = false,
  env: Environment = process.env,
) {
  const config = trialConfiguration(env);
  const authorization = request.headers.get("authorization");
  if (bearerOnly && !config.enabled && !config.legacyToken)
    throw new AppError("服务端尚未配置有效的邀请码或插件访问令牌。", 503);
  if (authorization !== null || bearerOnly) {
    const owner = ownerForToken(
      authorization?.match(/^Bearer (\S+)$/i)?.[1],
      env,
    );
    if (!owner)
      throw new AppError(
        "邀请码或插件令牌无效或已撤销，请重新登录或更新插件设置。",
        401,
      );
    return owner;
  }
  if (!config.enabled) return "personal";
  const owner = ownerForSession(cookieValue(request.headers), env);
  if (!owner) throw new AppError("请先使用自己的邀请码登录。", 401);
  return owner;
}

/** Cookie-authenticated writes must originate from the same application. */
export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("请从当前应用页面提交请求。", 403);
  const origin = request.headers.get("origin");
  if (!origin) {
    if (
      request.headers.has("sec-fetch-site") &&
      request.headers.get("sec-fetch-site") !== "same-origin"
    )
      throw new AppError("请求来源不合法。", 403);
    return; // Command-line clients do not attach browser fetch metadata.
  }
  try {
    const supplied = new URL(origin);
    const target = new URL(request.url);
    // TLS terminates at Railway: Next's internal URL may use HTTP while the
    // browser uses HTTPS. Host is the destination selected by the browser;
    // do not rely on a user-supplied X-Forwarded-Host override.
    if (
      !["http:", "https:"].includes(supplied.protocol) ||
      supplied.host !== (request.headers.get("host") ?? target.host)
    )
      throw new Error("origin mismatch");
  } catch {
    throw new AppError("请从当前应用页面提交请求。", 403);
  }
}
