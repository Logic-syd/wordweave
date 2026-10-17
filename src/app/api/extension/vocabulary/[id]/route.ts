import { NextResponse } from "next/server";
import { extensionHandler } from "@/lib/extension-auth";
import { updateWord } from "@/lib/repository";
import { readJson } from "@/lib/errors";
import { vocabularyUpdateSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return extensionHandler(request, async () => {
    const result = await updateWord(
      (await context.params).id,
      vocabularyUpdateSchema.parse(await readJson(request, 3000)),
    );
    return NextResponse.json({
      status: result.status,
      favorite: result.favorite,
      category: result.category,
      exposureCount: result.exposureCount,
      reviewCount: result.reviewCount,
      knownStreak: result.knownStreak,
      dueAt: result.dueAt,
    });
  });
}
