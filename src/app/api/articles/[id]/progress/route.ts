import { NextResponse } from "next/server";
import { saveProgress } from "@/lib/repository";
import { apiError, readJson } from "@/lib/errors";
import { progressSchema } from "@/lib/schemas";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await saveProgress(
        (await params).id,
        progressSchema.parse(await readJson(request, 3000)),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
