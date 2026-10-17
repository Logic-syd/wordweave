import { authHandler } from "@/lib/auth-handler";
import { NextResponse } from "next/server";
import { saveProgress } from "@/lib/repository";
import { readJson } from "@/lib/errors";
import { progressSchema } from "@/lib/schemas";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return authHandler(request, async () => {
    return NextResponse.json(
      await saveProgress(
        (await params).id,
        progressSchema.parse(await readJson(request, 3000)),
      ),
    );
  });
}
