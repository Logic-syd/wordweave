import { NextResponse } from "next/server";
import { generateArticle } from "@/lib/generation";
import { apiError, readJson } from "@/lib/errors";
import { settingsSchema } from "@/lib/schemas";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const settings = settingsSchema.parse(await readJson(request, 5000));
    const versionId = await generateArticle((await params).id, settings);
    return NextResponse.json({ versionId });
  } catch (e) {
    return apiError(e);
  }
}
