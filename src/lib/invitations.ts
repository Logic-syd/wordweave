import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type Invitation, type Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { currentOwnerId } from "./auth-context";
import { AppError } from "./errors";

const invitationPattern = /^inv_[A-Za-z0-9_-]{43}$/;
const sessionPattern = /^ses_[A-Za-z0-9_-]{43}$/;
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const requestKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,100}$/, "请求标识不合法，请刷新后重试。");
const createSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "请填写邀请名称。")
      .max(60, "邀请名称最多 60 个字符。"),
    requestKey: requestKeySchema,
  })
  .strict();
const changeSchema = z
  .object({
    action: z.enum(["revoke", "rotate"]),
    requestKey: requestKeySchema,
  })
  .strict();

export type InvitationView = {
  id: string;
  ownerId: string;
  label: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};
export type InvitationResult = {
  invitation: InvitationView;
  token: string | null;
  replayed: boolean;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function publicInvitation(invitation: Invitation): InvitationView {
  return {
    id: invitation.id,
    ownerId: invitation.ownerId,
    label: invitation.label,
    active: invitation.revokedAt === null,
    createdAt: invitation.createdAt.toISOString(),
    updatedAt: invitation.updatedAt.toISOString(),
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
  };
}
function requireManager() {
  if (currentOwnerId() !== "personal")
    throw new AppError("仅管理员可以管理邀请。", 403);
}
async function managementTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  requireManager();
  return db.$transaction(
    async (tx) => {
      // Short management transactions serialize the cap and operation log across
      // processes. Login and revocation additionally share the invitation row lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1694772031)`;
      return action(tx);
    },
    { timeout: 15000 },
  );
}
function operationIdentity(
  requestKey: string,
  action: "create" | "rotate" | "revoke",
  invitationId: string | null,
  label: string | null,
) {
  return {
    requestKey: hash(`invitation-operation\0${requestKey}`),
    requestHash: hash(JSON.stringify([action, invitationId, label])),
  };
}
async function replayOperation(
  tx: Prisma.TransactionClient,
  identity: ReturnType<typeof operationIdentity>,
): Promise<InvitationResult | null> {
  const previous = await tx.invitationOperation.findUnique({
    where: { requestKey: identity.requestKey },
    include: { invitation: true },
  });
  if (!previous) return null;
  if (previous.requestHash !== identity.requestHash)
    throw new AppError("该请求标识已用于其他邀请操作，请重新操作。", 409);
  // Only the original response contains the secret; no plaintext is recoverable
  // from storage. Retrying an old rotate must never invalidate a later token.
  return {
    invitation: publicInvitation(previous.invitation),
    token: null,
    replayed: true,
  };
}

export async function listInvitations(): Promise<InvitationView[]> {
  requireManager();
  const invitations = await db.invitation.findMany({
    orderBy: { createdAt: "desc" },
  });
  return invitations.map(publicInvitation);
}

export async function createInvitation(input: {
  label: string;
  requestKey: string;
}): Promise<InvitationResult> {
  requireManager();
  const { label, requestKey } = createSchema.parse(input);
  const identity = operationIdentity(requestKey, "create", null, label);
  return managementTransaction(async (tx) => {
    const previous = await replayOperation(tx, identity);
    if (previous) return previous;
    if ((await tx.invitation.count()) >= 100)
      throw new AppError(
        "已达到 100 个邀请的上限，可以重新生成已有邀请。",
        429,
      );
    const token = `inv_${randomBytes(32).toString("base64url")}`;
    const invitation = await tx.invitation.create({
      data: {
        ownerId: `friend_${randomUUID()}`,
        label,
        tokenHash: hash(token),
      },
    });
    await tx.invitationOperation.create({
      data: { ...identity, action: "create", invitationId: invitation.id },
    });
    return { invitation: publicInvitation(invitation), token, replayed: false };
  });
}

export async function changeInvitation(
  id: string,
  input: { action: "revoke" | "rotate"; requestKey: string },
): Promise<InvitationResult> {
  requireManager();
  const invitationId = z.string().min(1).max(100).parse(id);
  const { action, requestKey } = changeSchema.parse(input);
  const identity = operationIdentity(requestKey, action, invitationId, null);
  return managementTransaction(async (tx) => {
    const previous = await replayOperation(tx, identity);
    if (previous) return previous;
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Invitation" WHERE "id" = ${invitationId} FOR UPDATE
    `;
    if (!locked.length) throw new AppError("邀请不存在。", 404);
    const existing = await tx.invitation.findUniqueOrThrow({
      where: { id: invitationId },
    });
    const token =
      action === "rotate"
        ? `inv_${randomBytes(32).toString("base64url")}`
        : null;
    const invitation = await tx.invitation.update({
      where: { id: invitationId },
      data: token
        ? { tokenHash: hash(token), revokedAt: null }
        : { revokedAt: existing.revokedAt ?? new Date() },
    });
    await tx.invitationSession.deleteMany({ where: { invitationId } });
    await tx.invitationOperation.create({
      data: { ...identity, action, invitationId },
    });
    return { invitation: publicInvitation(invitation), token, replayed: false };
  });
}

export async function findInvitationOwner(
  token: string,
): Promise<string | null> {
  if (!invitationPattern.test(token)) return null;
  const invitation = await db.invitation.findFirst({
    where: { tokenHash: hash(token), revokedAt: null },
    select: { ownerId: true },
  });
  return invitation?.ownerId ?? null;
}

export async function createInvitationSession(
  token: string,
): Promise<{ ownerId: string; cookie: string } | null> {
  if (!invitationPattern.test(token)) return null;
  const tokenHash = hash(token);
  return db.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Invitation" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
    `;
      if (!locked.length) return null;
      const invitation = await tx.invitation.findFirst({
        where: { id: locked[0].id, tokenHash, revokedAt: null },
        select: { id: true, ownerId: true },
      });
      if (!invitation) return null;
      const now = new Date();
      await tx.invitationSession.deleteMany({
        where: { invitationId: invitation.id, expiresAt: { lte: now } },
      });
      // The invitation row lock serializes logins as well as revocation. Keep at
      // most twenty active sessions so repeated logins cannot grow this table.
      const older = await tx.invitationSession.findMany({
        where: { invitationId: invitation.id },
        orderBy: [{ createdAt: "desc" }, { tokenHash: "desc" }],
        skip: 19,
        select: { tokenHash: true },
      });
      if (older.length)
        await tx.invitationSession.deleteMany({
          where: {
            tokenHash: { in: older.map((session) => session.tokenHash) },
          },
        });
      const cookie = `ses_${randomBytes(32).toString("base64url")}`;
      await tx.invitationSession.create({
        data: {
          tokenHash: hash(cookie),
          invitationId: invitation.id,
          expiresAt: new Date(now.getTime() + sessionLifetime),
        },
      });
      return { ownerId: invitation.ownerId, cookie };
    },
    { timeout: 15000 },
  );
}

export async function findInvitationSessionOwner(
  cookie: string,
): Promise<string | null> {
  if (!sessionPattern.test(cookie)) return null;
  const session = await db.invitationSession.findFirst({
    where: {
      tokenHash: hash(cookie),
      expiresAt: { gt: new Date() },
      invitation: { revokedAt: null },
    },
    select: { invitation: { select: { ownerId: true } } },
  });
  return session?.invitation.ownerId ?? null;
}

export async function revokeInvitationSession(cookie: string): Promise<void> {
  if (!sessionPattern.test(cookie)) return;
  await db.invitationSession.deleteMany({ where: { tokenHash: hash(cookie) } });
}
