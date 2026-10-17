import { captureOwnerCallback } from "@/lib/auth-context";
import { after, NextResponse } from "next/server";
import { extensionHandler } from "@/lib/extension-auth";
import { retryExtensionJob, runExtensionJob } from "@/lib/extension-jobs";

export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return extensionHandler(request, async () => {
    const job = await retryExtensionJob((await context.params).id);
    if (job.status === "pending")
      after(captureOwnerCallback(() => runExtensionJob(job.id)));
    return NextResponse.json(job, { status: 202 });
  });
}
