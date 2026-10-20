import { AppError } from "./errors";
import { currentOwnerId } from "./auth-context";
import {
  createInvitationSession,
  findInvitationOwner,
  findInvitationSessionOwner,
  revokeInvitationSession,
} from "./invitations";
import {
  cookieValue,
  createSession,
  ownerForSession,
  ownerForToken,
  trialConfiguration,
} from "./trial-auth";

const invitationToken = /^inv_[A-Za-z0-9_-]{43}$/;
const invitationCookie = /^ses_[A-Za-z0-9_-]{43}$/;
const invalidAccess = () =>
  new AppError("邀请码无效或已撤销，请重新登录或更新插件设置。", 401);

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

/** Resolve every request against the current credential and invitation state. */
export async function resolveRequestOwner(
  request: Request,
  bearerOnly = false,
) {
  const config = trialConfiguration();
  const authorization = request.headers.get("authorization");
  if (authorization !== null || bearerOnly) {
    if (!config.enabled && bearerOnly)
      throw new AppError("服务端尚未配置有效的站主凭据或邀请码。", 503);
    const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    const owner =
      ownerForToken(token) ??
      (token && invitationToken.test(token)
        ? await findInvitationOwner(token)
        : null);
    if (!owner) throw invalidAccess();
    return owner;
  }
  if (!config.enabled) return "personal";
  const cookie = cookieValue(request.headers);
  const owner =
    cookie && invitationCookie.test(cookie)
      ? await findInvitationSessionOwner(cookie)
      : ownerForSession(cookie);
  if (!owner) throw new AppError("请先使用自己的邀请码登录。", 401);
  return owner;
}

export async function loginIdentity(token: string) {
  const config = trialConfiguration();
  // Local anonymous mode is convenient for development, but never creates
  // an administrator credential or a persisted privileged session.
  if (!config.enabled)
    return { ownerId: "personal", cookie: null, isAdmin: false };
  const ownerId = ownerForToken(token);
  if (ownerId)
    return {
      ownerId,
      cookie: createSession(ownerId),
      isAdmin: ownerId === "personal",
    };
  const session = invitationToken.test(token)
    ? await createInvitationSession(token)
    : null;
  if (!session) throw invalidAccess();
  return { ...session, isAdmin: false };
}

export async function logoutIdentity(request: Request) {
  const cookie = cookieValue(request.headers);
  if (cookie && invitationCookie.test(cookie))
    await revokeInvitationSession(cookie);
}

export function requireAdministrator() {
  if (currentOwnerId() !== "personal" || !trialConfiguration().enabled)
    throw new AppError("只有站主可以管理邀请。", 403);
}
