import { PracticePage, type PracticeSearch } from "@/components/practice-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "听力 · 听懂一段" };
export default function ListenPage({
  searchParams,
}: {
  searchParams: PracticeSearch;
}) {
  return <PracticePage skill="listen" searchParams={searchParams} />;
}
