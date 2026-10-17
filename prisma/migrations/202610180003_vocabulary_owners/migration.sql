ALTER TABLE "VocabularyItem" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT 'personal';
CREATE INDEX "VocabularyItem_ownerId_language_idx" ON "VocabularyItem"("ownerId", "language");
