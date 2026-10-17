import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { temporaryDatabase } from "./helpers/local-database";
import { runAsOwner } from "../src/lib/auth-context";
import {
  changeInvitation,
  createInvitation,
  createInvitationSession,
  findInvitationOwner,
  findInvitationSessionOwner,
  listInvitations,
  revokeInvitationSession,
} from "../src/lib/invitations";

const isolated = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("../src/lib/db", () => ({
  get db() {
    return isolated.db;
  },
}));
let database: Awaited<ReturnType<typeof temporaryDatabase>> | undefined;
const manage = <T>(action: () => T) => runAsOwner("personal", action);
const create = (label = "朋友") =>
  manage(() => createInvitation({ label, requestKey: randomUUID() }));
const change = (
  id: string,
  action: "revoke" | "rotate",
  requestKey = randomUUID(),
) => manage(() => changeInvitation(id, { action, requestKey }));

beforeAll(async () => {
  database = await temporaryDatabase();
  isolated.db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: database.url }),
  });
}, 45000);
beforeEach(async () => {
  // This client exclusively targets the temporary local database, never the app.
  await isolated.db.invitation.deleteMany();
});
afterAll(async () => {
  await isolated.db?.$disconnect();
  await database?.cleanup();
}, 20000);

describe("database invitations and revocable sessions", () => {
  it("serializes identical creation requests, binds the payload and returns a secret only once", async () => {
    const requestKey = randomUUID();
    const results = await manage(() =>
      Promise.all(
        Array.from({ length: 8 }, () =>
          createInvitation({ label: "  Anna  ", requestKey }),
        ),
      ),
    );
    expect(new Set(results.map((result) => result.invitation.id)).size).toBe(1);
    expect(results.filter((result) => result.token !== null)).toHaveLength(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(7);
    expect(results[0].invitation.label).toBe("Anna");
    expect(await isolated.db.invitation.count()).toBe(1);
    expect(await isolated.db.invitationOperation.count()).toBe(1);
    await expect(
      manage(() => createInvitation({ label: "Bob", requestKey })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      change(results[0].invitation.id, "rotate", requestKey),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("stores only secret hashes and exposes a restricted management DTO", async () => {
    const created = await create("Anna");
    expect(created.token).toMatch(/^inv_[A-Za-z0-9_-]{43}$/);
    expect(created.invitation.ownerId).toMatch(/^friend_[a-f0-9-]{36}$/);
    const session = await createInvitationSession(created.token!);
    expect(session?.cookie).toMatch(/^ses_[A-Za-z0-9_-]{43}$/);
    const invitationRow = await isolated.db.invitation.findUniqueOrThrow({
      where: { id: created.invitation.id },
    });
    const sessions = await isolated.db.invitationSession.findMany();
    const operations = await isolated.db.invitationOperation.findMany();
    expect(invitationRow.tokenHash).toBe(
      createHash("sha256").update(created.token!).digest("hex"),
    );
    expect(sessions[0].tokenHash).toBe(
      createHash("sha256").update(session!.cookie).digest("hex"),
    );
    const stored = JSON.stringify({ invitationRow, sessions, operations });
    expect(stored).not.toContain(created.token);
    expect(stored).not.toContain(session!.cookie);
    expect(
      sessions[0].expiresAt.getTime() - sessions[0].createdAt.getTime(),
    ).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 2000);
    const listed = await manage(listInvitations);
    expect(Object.keys(listed[0]).sort()).toEqual([
      "active",
      "createdAt",
      "id",
      "label",
      "ownerId",
      "revokedAt",
      "updatedAt",
    ]);
    expect(await findInvitationOwner(created.token!)).toBe(
      created.invitation.ownerId,
    );
    expect(await findInvitationSessionOwner(session!.cookie)).toBe(
      created.invitation.ownerId,
    );
  });

  it("rotates both bearer and sessions without changing owner, and never replays an old rotation", async () => {
    const first = await create();
    const oldSession = await createInvitationSession(first.token!);
    const firstRotationKey = randomUUID();
    const second = await change(
      first.invitation.id,
      "rotate",
      firstRotationKey,
    );
    expect(second.invitation.ownerId).toBe(first.invitation.ownerId);
    expect(await findInvitationOwner(first.token!)).toBeNull();
    expect(await findInvitationSessionOwner(oldSession!.cookie)).toBeNull();
    expect(await findInvitationOwner(second.token!)).toBe(
      first.invitation.ownerId,
    );
    const secondSession = await createInvitationSession(second.token!);
    const third = await change(first.invitation.id, "rotate");
    const repeated = await change(
      first.invitation.id,
      "rotate",
      firstRotationKey,
    );
    expect(repeated).toMatchObject({ token: null, replayed: true });
    expect(await findInvitationOwner(third.token!)).toBe(
      first.invitation.ownerId,
    );
    expect(await findInvitationOwner(second.token!)).toBeNull();
    expect(await findInvitationSessionOwner(secondSession!.cookie)).toBeNull();
    expect(await isolated.db.invitationOperation.count()).toBe(3);
  });

  it("revokes immediately, rejects new sessions and reactivates only with a newly rotated token", async () => {
    const created = await create();
    const session = await createInvitationSession(created.token!);
    const requestKey = randomUUID();
    const revoked = await change(created.invitation.id, "revoke", requestKey);
    expect(revoked).toMatchObject({
      token: null,
      replayed: false,
      invitation: { active: false },
    });
    expect(await findInvitationOwner(created.token!)).toBeNull();
    expect(await findInvitationSessionOwner(session!.cookie)).toBeNull();
    expect(await createInvitationSession(created.token!)).toBeNull();
    expect(
      (await change(created.invitation.id, "revoke", requestKey)).replayed,
    ).toBe(true);
    const restored = await change(created.invitation.id, "rotate");
    expect(restored.invitation.active).toBe(true);
    expect(restored.invitation.ownerId).toBe(created.invitation.ownerId);
    expect(await findInvitationOwner(created.token!)).toBeNull();
    expect(await findInvitationOwner(restored.token!)).toBe(
      created.invitation.ownerId,
    );
  });

  it("serializes revocation with concurrent logins so no usable old session survives", async () => {
    const created = await create();
    const pending = Array.from({ length: 12 }, () =>
      createInvitationSession(created.token!),
    );
    const revoked = change(created.invitation.id, "revoke");
    const sessions = await Promise.all(pending);
    await revoked;
    for (const session of sessions)
      if (session)
        expect(await findInvitationSessionOwner(session.cookie)).toBeNull();
    expect(await isolated.db.invitationSession.count()).toBe(0);
    expect(await createInvitationSession(created.token!)).toBeNull();
  });

  it("expires sessions and logs out only the supplied session", async () => {
    const created = await create();
    const first = await createInvitationSession(created.token!);
    const second = await createInvitationSession(created.token!);
    await revokeInvitationSession(first!.cookie);
    expect(await findInvitationSessionOwner(first!.cookie)).toBeNull();
    expect(await findInvitationSessionOwner(second!.cookie)).toBe(
      created.invitation.ownerId,
    );
    await isolated.db.invitationSession.updateMany({
      data: { expiresAt: new Date(0) },
    });
    expect(await findInvitationSessionOwner(second!.cookie)).toBeNull();
    expect(await findInvitationSessionOwner("ses_invalid")).toBeNull();
    expect(await findInvitationOwner("inv_invalid")).toBeNull();
  });

  it("bounds repeated logins to twenty active sessions per invitation", async () => {
    const created = await create();
    const other = await create("Other friend");
    const otherSession = await createInvitationSession(other.token!);
    let newest: Awaited<ReturnType<typeof createInvitationSession>> = null;
    for (let index = 0; index < 25; index++)
      newest = await createInvitationSession(created.token!);
    expect(
      await isolated.db.invitationSession.count({
        where: { invitationId: created.invitation.id },
      }),
    ).toBe(20);
    expect(await findInvitationSessionOwner(newest!.cookie)).toBe(
      created.invitation.ownerId,
    );
    expect(await findInvitationSessionOwner(otherSession!.cookie)).toBe(
      other.invitation.ownerId,
    );
  });

  it("checks administrator scope and invitation limits while allowing replay at capacity", async () => {
    const requestKey = randomUUID();
    const first = await manage(() =>
      createInvitation({ label: "First", requestKey }),
    );
    await expect(
      runAsOwner("friend_alice", listInvitations),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      runAsOwner("friend_alice", () =>
        createInvitation({ label: "No", requestKey: randomUUID() }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      runAsOwner("friend_alice", () =>
        changeInvitation(first.invitation.id, {
          action: "rotate",
          requestKey: randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await isolated.db.invitation.createMany({
      data: Array.from({ length: 99 }, (_, index) => ({
        ownerId: `friend_fixture_${index}`,
        label: `Fixture ${index}`,
        tokenHash: `fixture-hash-${index}`,
      })),
    });
    await expect(create("Over quota")).rejects.toMatchObject({ status: 429 });
    const repeated = await manage(() =>
      createInvitation({ label: "First", requestKey }),
    );
    expect(repeated).toMatchObject({ token: null, replayed: true });
    expect(await isolated.db.invitation.count()).toBe(100);
  });
});
