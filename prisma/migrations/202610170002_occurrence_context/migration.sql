-- Keep contextual grammar and examples independent of the dictionary entry.
ALTER TABLE "Occurrence"
ADD COLUMN "grammar" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "explanation" TEXT,
ADD COLUMN "example" TEXT,
ADD COLUMN "exampleTranslation" TEXT;
