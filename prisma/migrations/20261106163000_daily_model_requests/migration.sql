-- Existing article-generation counts and user data remain unchanged.
-- Provider-attempt tracking starts when this migration is deployed.
ALTER TABLE "GenerationUsage" ADD COLUMN "modelCalls" INTEGER NOT NULL DEFAULT 0;
