import { withPageOwner } from "@/lib/auth-page";
import { notFound } from "next/navigation";
import { getArticle, requireArticle } from "@/lib/repository";
import { Reader } from "@/components/reader";
import { modelConfigured } from "@/lib/generation";
import { settingsSchema } from "@/lib/schemas";
import { AppError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  return withPageOwner(async () => {
    const { id } = await params;
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
        configured={modelConfigured()}
        autoGenerate={(await searchParams).generate === "1"}
        initialSettings={settingsSchema.parse(
          article.version?.settings ?? row.draftSettings ?? {},
        )}
      />
    );
  }, "/read");
}
