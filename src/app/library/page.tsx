import { ui } from "@/lib/ui";
import { LearningResources } from "@/components/learning-resources";
import { SampleLibrary } from "@/components/sample-library";
import { SavedLessons } from "@/components/saved-lessons";
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return (
    <>
      <SavedLessons />
      <SampleLibrary
        personal={[]}
        mode={mode === "tech" || mode === "german" ? mode : "all"}
      />
      <section className="page library-resources">
        <details>
          <summary>{ui("找一些新的阅读素材")}</summary>
          <LearningResources />
        </details>
      </section>
    </>
  );
}
