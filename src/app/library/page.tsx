import { withOptionalPageOwner } from "@/lib/auth-page";
import { listArticles } from "@/lib/repository";
import { SampleLibrary } from "@/components/sample-library";
export const dynamic = "force-dynamic";
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const requested = (await searchParams).mode;
  const mode =
    requested === "tech" || requested === "german" ? requested : "all";
  return withOptionalPageOwner(async (owner) => {
    return (
      <SampleLibrary
        key={`${owner ?? "guest"}-${mode}`}
        mode={mode}
        personal={owner ? JSON.parse(JSON.stringify(await listArticles())) : []}
      />
    );
  });
}
