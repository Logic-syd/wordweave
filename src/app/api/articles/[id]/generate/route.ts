import { authHandler } from "@/lib/auth-handler";
import { NextResponse } from "next/server";
import { generateArticle } from "@/lib/generation";
import { readJson } from "@/lib/errors";
import { settingsSchema } from "@/lib/schemas";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return authHandler(request, async () => {
    const settings = settingsSchema.parse(await readJson(request, 5000));
    const versionId = await generateArticle((await params).id, settings);
    return NextResponse.json({ versionId });
  });
}
