import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { trialConfiguration } from "@/lib/trial-auth";
import { resolveRequestOwner } from "@/lib/auth-identity";

export async function GET(request: Request) {
  let enabled = true;
  let configured = false;
  try {
    const config = trialConfiguration();
    enabled = config.enabled;
    configured = config.tokens.size > 0;
    const ownerId = await resolveRequestOwner(request);
    return NextResponse.json(
      {
        authenticated: true,
        ownerId,
        configured,
        enabled,
        isAdmin: configured && ownerId === "personal",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        configured,
        enabled,
        isAdmin: false,
        ...(error instanceof AppError && error.status === 503
          ? { error: error.message }
          : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
