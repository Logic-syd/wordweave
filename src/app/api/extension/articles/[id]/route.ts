import { NextResponse } from "next/server";
import { extensionHandler } from "@/lib/extension-auth";
import { getExtensionJob } from "@/lib/extension-jobs";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return extensionHandler(request, async () =>
    NextResponse.json(await getExtensionJob((await context.params).id)),
  );
}
