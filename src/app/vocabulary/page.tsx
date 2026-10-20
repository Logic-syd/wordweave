import { withOptionalPageOwner } from "@/lib/auth-page";
import { listVocabulary } from "@/lib/repository";
import { SampleVocabulary } from "@/components/sample-vocabulary";
export const dynamic = "force-dynamic";
export default async function VocabularyPage() {
  return withOptionalPageOwner(async (owner) => {
    return (
      <SampleVocabulary
        key={owner ?? "guest"}
        personal={
          owner ? JSON.parse(JSON.stringify(await listVocabulary())) : []
        }
      />
    );
  });
}
