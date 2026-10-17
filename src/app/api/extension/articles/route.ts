import { captureOwnerCallback } from "@/lib/auth-context";
import { after, NextResponse } from "next/server";
import { extensionHandler } from "@/lib/extension-auth";
import { createExtensionJob, runExtensionJob } from "@/lib/extension-jobs";
import { readJson } from "@/lib/errors";

export const maxDuration = 300;

export async function POST(request: Request) {
  return extensionHandler(request, async () => {
    const job = await createExtensionJob(await readJson(request, 180000));
    if (job.status === "pending")
      after(captureOwnerCallback(() => runExtensionJob(job.id)));
    return NextResponse.json(job, { status: 202 });
  });
}
