import type { PracticeSkill } from "@/lib/practice-schemas";
import { BrowserPracticePage } from "./browser-pages";
export type PracticeSearch = Promise<{
  material?: string;
  paragraph?: string;
  word?: string;
}>;
export async function PracticePage({
  skill,
  searchParams,
}: {
  skill: PracticeSkill;
  searchParams: PracticeSearch;
}) {
  const params = await searchParams;
  return (
    <BrowserPracticePage
      key={JSON.stringify([
        skill,
        params.material,
        params.word,
        params.paragraph,
      ])}
      skill={skill}
      {...params}
    />
  );
}
