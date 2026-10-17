import { NextResponse } from "next/server";
import { updateWord } from "@/lib/repository";
import { apiError, readJson } from "@/lib/errors";
import { vocabularyUpdateSchema } from "@/lib/schemas";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await updateWord(
        (await params).id,
        vocabularyUpdateSchema.parse(await readJson(request, 3000)),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
