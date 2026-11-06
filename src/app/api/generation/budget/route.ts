import { NextResponse } from "next/server";
import { authHandler } from "@/lib/auth-handler";
import { currentOwnerId } from "@/lib/auth-context";
import { getGenerationBudget } from "@/lib/generation-budget";

export async function GET(request: Request) {
  return authHandler(request, async () =>
    NextResponse.json(await getGenerationBudget(currentOwnerId())),
  );
}
