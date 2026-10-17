ALTER TABLE "Article" ADD COLUMN "generationProgress" JSONB;

CREATE TABLE "GenerationUsage" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "inputChars" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "GenerationUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GenerationUsage_ownerId_day_key" ON "GenerationUsage"("ownerId", "day");

CREATE TABLE "GenerationPermit" (
  "token" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationPermit_pkey" PRIMARY KEY ("token")
);
CREATE INDEX "GenerationPermit_ownerId_expiresAt_idx" ON "GenerationPermit"("ownerId", "expiresAt");
CREATE INDEX "GenerationPermit_expiresAt_idx" ON "GenerationPermit"("expiresAt");
