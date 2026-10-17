-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'personal',
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceText" TEXT NOT NULL,
    "sourceBlocks" JSONB NOT NULL,
    "origin" TEXT NOT NULL,
    "demoKey" TEXT,
    "requestKey" TEXT,
    "draftSettings" JSONB NOT NULL DEFAULT '{}',
    "activeVersionId" TEXT,
    "generationToken" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "generationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "coverage" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paragraph" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "original" TEXT NOT NULL,
    "segments" JSONB NOT NULL,

    CONSTRAINT "Paragraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyItem" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "partOfSpeech" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "grammar" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "exampleTranslation" TEXT NOT NULL,

    CONSTRAINT "VocabularyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "sentence" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVocabulary" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'personal',
    "vocabularyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "exposureCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "knownStreak" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'personal',
    "paragraphId" TEXT,
    "view" TEXT NOT NULL DEFAULT 'learning',
    "glossMode" TEXT NOT NULL DEFAULT 'first',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanguagePreference" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'personal',
    "language" TEXT NOT NULL,
    "glossMode" TEXT NOT NULL DEFAULT 'first',
    "settings" JSONB NOT NULL,

    CONSTRAINT "LanguagePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_demoKey_key" ON "Article"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "Article_requestKey_key" ON "Article"("requestKey");

-- CreateIndex
CREATE INDEX "Article_ownerId_mode_createdAt_idx" ON "Article"("ownerId", "mode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Paragraph_versionId_sourceId_key" ON "Paragraph"("versionId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyItem_key_key" ON "VocabularyItem"("key");

-- CreateIndex
CREATE INDEX "Occurrence_vocabularyId_versionId_idx" ON "Occurrence"("vocabularyId", "versionId");

-- CreateIndex
CREATE INDEX "UserVocabulary_ownerId_status_dueAt_idx" ON "UserVocabulary"("ownerId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserVocabulary_ownerId_vocabularyId_key" ON "UserVocabulary"("ownerId", "vocabularyId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingProgress_articleId_key" ON "ReadingProgress"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "LanguagePreference_ownerId_language_key" ON "LanguagePreference"("ownerId", "language");

-- AddForeignKey
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paragraph" ADD CONSTRAINT "Paragraph_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ArticleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ArticleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVocabulary" ADD CONSTRAINT "UserVocabulary_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
