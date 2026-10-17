import { NextResponse } from "next/server";
import { extensionHandler } from "@/lib/extension-auth";
import { modelConfigured } from "@/lib/generation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return extensionHandler(request, async () =>
    NextResponse.json({ ok: true, modelConfigured: modelConfigured() }),
  );
}
