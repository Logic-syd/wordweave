import { withPageOwner } from "@/lib/auth-page";
import { listVocabulary } from "@/lib/repository";
import { Vocabulary } from "@/components/vocabulary";
export const dynamic = "force-dynamic";
export default async function VocabularyPage() {
  return withPageOwner(async () => {
    return (
      <Vocabulary
        initial={JSON.parse(JSON.stringify(await listVocabulary()))}
      />
    );
  }, "/vocabulary");
}
