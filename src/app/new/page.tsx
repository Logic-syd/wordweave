import { withOptionalPageOwner } from "@/lib/auth-page";
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
  return withOptionalPageOwner(async (owner) => {
    const mode = (await searchParams).mode === "german" ? "german" : "tech";
    const language = mode === "tech" ? "en" : "de";
    const [preference, due] = owner
      ? await Promise.all([
          db.languagePreference.findUnique({
            where: { ownerId_language: { ...userScope(), language } },
          }),
          getReviewTargets(),
        ])
      : [null, []];
    return (
      <NewForm
        mode={mode}
        authorized={Boolean(owner)}
        configured={modelConfigured()}
        initialSettings={settingsSchema.parse(preference?.settings ?? {})}
        dueWords={due.map((w) => w.lemma)}
      />
    );
  });
}
