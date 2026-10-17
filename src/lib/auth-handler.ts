import { NextResponse } from "next/server";
import { runAsOwner } from "./auth-context";
import { apiError } from "./errors";
import { assertSameOrigin, requireRequestOwner } from "./trial-auth";

export async function authHandler(
  request: Request,
  action: () => Promise<NextResponse>,
) {
  try {
    assertSameOrigin(request);
    const owner = requireRequestOwner(request);
    const response = await runAsOwner(owner, action);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
