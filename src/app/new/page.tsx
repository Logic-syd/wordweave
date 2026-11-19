import { BrowserNewPage } from "@/components/browser-pages";
export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const mode = (await searchParams).mode === "german" ? "german" : "tech";
  return <BrowserNewPage key={mode} mode={mode} />;
}
