import { withPageOwner } from "@/lib/auth-page";
import { notFound } from "next/navigation";
import { getArticle, requireArticle } from "@/lib/repository";
import { Reader } from "@/components/reader";
import { modelConfigured } from "@/lib/generation";
import { settingsSchema } from "@/lib/schemas";
import { AppError } from "@/lib/errors";
import { getSample } from "@/lib/samples";
import { SampleReader } from "@/components/sample-reader";
import { BrowserReader } from "@/components/browser-pages";
export const dynamic = "force-dynamic";
export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const { id } = await params;
  if (id.startsWith("local-article-"))
    return (
      <BrowserReader
        key={id}
        id={id}
        autoGenerate={(await searchParams).generate === "1"}
      />
    );
  const sample = getSample(id);
  if (sample) return <SampleReader article={sample} />;
  if (id.startsWith("sample-")) notFound();
  return withPageOwner(
    async () => {
      let data;
      try {
        data = await Promise.all([getArticle(id), requireArticle(id)]);
      } catch (e) {
        if (e instanceof AppError && e.status === 404) notFound();
        throw e;
      }
      const [article, row] = data;
      return (
        <Reader
          initial={article}
          configured={
            process.env.SERVER_AI_ENABLED === "true" && modelConfigured()
          }
          autoGenerate={(await searchParams).generate === "1"}
          initialSettings={settingsSchema.parse(
            article.version?.settings ?? row.draftSettings ?? {},
          )}
        />
      );
    },
    `/read/${encodeURIComponent(id)}`,
  );
}
