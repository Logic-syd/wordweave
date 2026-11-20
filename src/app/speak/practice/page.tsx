import { PracticePage, type PracticeSearch } from "@/components/practice-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "口语 · 复述与录音 / Retell and record" };
export default function SpeakPage({
  searchParams,
}: {
  searchParams: PracticeSearch;
}) {
  return <PracticePage skill="speak" searchParams={searchParams} />;
}
