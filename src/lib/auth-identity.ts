import { AppError } from "./errors";
import { currentOwnerId } from "./auth-context";
import {
  cookieValue,
  createSession,
  ownerForSession,
  ownerForToken,
  trialConfiguration,
} from "./trial-auth";

const invalidAccess = () =>
  new AppError("访问密码无效，请使用自己的个人访问密码。", 401);

export async function optionalRequestOwner(
  request: Request,
): Promise<string | null> {
  try {
    return await resolveRequestOwner(request);
  } catch (error) {
    if (error instanceof AppError && [401, 503].includes(error.status))
      return null;
    throw error;
  }
}

/** Resolve every request against the owner credential; historical friend credentials never grant access. */
export async function resolveRequestOwner(
  request: Request,
  bearerOnly = false,
) {
  const config = trialConfiguration();
  const authorization = request.headers.get("authorization");
  if (authorization !== null || bearerOnly) {
    if (!config.enabled && bearerOnly)
      throw new AppError("服务端尚未配置个人访问密码。", 503);
    const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    const owner = ownerForToken(token);
    if (owner !== "personal") throw invalidAccess();
    return owner;
  }
  if (!config.enabled) return "personal";
  const owner = ownerForSession(cookieValue(request.headers));
  if (owner !== "personal") throw new AppError("请先登录个人空间。", 401);
  return owner;
}

export async function loginIdentity(token: string) {
  const config = trialConfiguration();
  // Local anonymous mode is convenient for development, but never creates
  // an administrator credential or a persisted privileged session.
  if (!config.enabled)
    return { ownerId: "personal", cookie: null, isAdmin: false };
  const ownerId = ownerForToken(token);
  if (ownerId === "personal")
    return {
      ownerId,
      cookie: createSession(ownerId),
      isAdmin: ownerId === "personal",
    };
  throw invalidAccess();
}

export function requireAdministrator() {
  if (currentOwnerId() !== "personal" || !trialConfiguration().enabled)
    throw new AppError("只有站主可以管理邀请。", 403);
}
