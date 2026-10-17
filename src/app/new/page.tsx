import { db, userScope } from "@/lib/db";
import { getReviewTargets } from "@/lib/repository";
import { modelConfigured } from "@/lib/generation";
import { settingsSchema } from "@/lib/schemas";
import { NewForm } from "@/components/new-form";
export const dynamic = "force-dynamic";
export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const mode = (await searchParams).mode === "german" ? "german" : "tech";
  const language = mode === "tech" ? "en" : "de";
  const [preference, due] = await Promise.all([
    db.languagePreference.findUnique({
      where: { ownerId_language: { ...userScope(), language } },
    }),
    getReviewTargets(),
  ]);
  return (
    <NewForm
      mode={mode}
      configured={modelConfigured()}
      initialSettings={settingsSchema.parse(preference?.settings ?? {})}
      dueWords={due.map((w) => w.lemma)}
    />
  );
}
