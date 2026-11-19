CREATE TABLE "StudyItem" (
  "ownerId" TEXT NOT NULL DEFAULT 'personal',
  "kind" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudyItem_pkey" PRIMARY KEY ("ownerId", "kind", "id")
);
CREATE INDEX "StudyItem_ownerId_kind_updatedAt_idx" ON "StudyItem"("ownerId", "kind", "updatedAt");
CREATE TABLE "PracticeOccurrence" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL DEFAULT 'personal',
  "vocabularyId" TEXT NOT NULL,
  "skill" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "paragraphId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "form" TEXT NOT NULL,
  "sentence" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PracticeOccurrence_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "practice_occurrence_source_key" ON "PracticeOccurrence"("ownerId", "vocabularyId", "skill", "materialId", "paragraphId");
CREATE INDEX "PracticeOccurrence_ownerId_vocabularyId_idx" ON "PracticeOccurrence"("ownerId", "vocabularyId");
