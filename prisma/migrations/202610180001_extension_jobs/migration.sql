CREATE TABLE "ExtensionJob" (
    "articleId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'personal',
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "retention" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "runToken" TEXT,
    "baseVersionId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionJob_pkey" PRIMARY KEY ("articleId")
);
CREATE UNIQUE INDEX "ExtensionJob_requestKey_key" ON "ExtensionJob"("requestKey");
CREATE INDEX "ExtensionJob_status_expiresAt_idx" ON "ExtensionJob"("status", "expiresAt");
CREATE INDEX "ExtensionJob_ownerId_createdAt_idx" ON "ExtensionJob"("ownerId", "createdAt");
ALTER TABLE "ExtensionJob" ADD CONSTRAINT "ExtensionJob_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
