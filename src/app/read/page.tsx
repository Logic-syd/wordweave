import { DirectReading } from "@/components/learning-entry";
import { redirect } from "next/navigation";
export const metadata = { title: "语境阅读 / Contextual reading" };
export default async function ReadingPage({
  searchParams,
}: {
  searchParams: Promise<{
    article?: string;
    sentence?: string;
    lang?: string;
    part?: string;
  }>;
}) {
  const { article, sentence, lang, part } = await searchParams;
  // Keep links saved when Read Along incorrectly occupied the reading entry.
  if (article) {
    const query = new URLSearchParams({ article });
    if (sentence) query.set("sentence", sentence);
    redirect(`/speak?${query}#exercise`);
  }
  return (
    <DirectReading
      language={lang === "de" ? "de" : "en"}
      part={part === "2" ? 1 : 0}
    />
  );
}
