import { PracticePage, type PracticeSearch } from "@/components/practice-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "口语 · 开口说两句" };
export default function SpeakPage({
  searchParams,
}: {
  searchParams: PracticeSearch;
}) {
  return <PracticePage skill="speak" searchParams={searchParams} />;
}
