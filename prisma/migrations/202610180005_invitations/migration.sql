CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvitationSession" (
    "tokenHash" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvitationSession_pkey" PRIMARY KEY ("tokenHash")
);

CREATE TABLE "InvitationOperation" (
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvitationOperation_pkey" PRIMARY KEY ("requestKey")
);

CREATE UNIQUE INDEX "Invitation_ownerId_key" ON "Invitation"("ownerId");
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "InvitationSession_invitationId_idx" ON "InvitationSession"("invitationId");
CREATE INDEX "InvitationSession_expiresAt_idx" ON "InvitationSession"("expiresAt");
CREATE INDEX "InvitationOperation_invitationId_idx" ON "InvitationOperation"("invitationId");

ALTER TABLE "InvitationSession" ADD CONSTRAINT "InvitationSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvitationOperation" ADD CONSTRAINT "InvitationOperation_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
