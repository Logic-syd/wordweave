import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { requireRequestOwner, trialConfiguration } from "@/lib/trial-auth";

export async function GET(request: Request) {
  let enabled = true;
  let configured = false;
  try {
    const config = trialConfiguration();
    enabled = config.enabled;
    configured = config.tokens.size > 0;
    const ownerId = requireRequestOwner(request);
    return NextResponse.json(
      { authenticated: true, ownerId, configured, enabled },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        configured,
        enabled,
        ...(error instanceof AppError && error.status === 503
          ? { error: error.message }
          : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
