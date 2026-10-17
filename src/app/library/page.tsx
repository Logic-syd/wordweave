import { listArticles } from "@/lib/repository";
import { Library } from "@/components/library";
export const dynamic = "force-dynamic";
export default async function LibraryPage() {
  return <Library initial={JSON.parse(JSON.stringify(await listArticles()))} />;
}
