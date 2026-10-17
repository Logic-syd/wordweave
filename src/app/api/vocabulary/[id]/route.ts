import { authHandler } from "@/lib/auth-handler";
import { NextResponse } from "next/server";
import { updateWord } from "@/lib/repository";
import { readJson } from "@/lib/errors";
import { vocabularyUpdateSchema } from "@/lib/schemas";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return authHandler(request, async () => {
    return NextResponse.json(
      await updateWord(
        (await params).id,
        vocabularyUpdateSchema.parse(await readJson(request, 3000)),
      ),
    );
  });
}
