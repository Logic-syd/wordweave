import { NextRequest, NextResponse } from "next/server";
import {
  extensionHeaders,
  extensionPreflight,
  requireExtensionAuth,
} from "./lib/extension-auth";
import { apiError } from "./lib/errors";
import { assertSameOrigin, trialConfiguration } from "./lib/trial-auth";
import { resolveRequestOwner } from "./lib/auth-identity";

function secure(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/extension/")) {
    if (request.method === "OPTIONS")
      return secure(extensionPreflight(request));
    try {
      await requireExtensionAuth(request);
      return secure(extensionHeaders(request, NextResponse.next()));
    } catch (error) {
      return secure(extensionHeaders(request, apiError(error)));
    }
  }
  try {
    assertSameOrigin(request);
    if (path === "/api/health" || path.startsWith("/api/auth/"))
      return secure(NextResponse.next());
    // Browsing is public. Private APIs and invitation management still require
    // identity; public sample readers never use a shared database owner.
    if (!path.startsWith("/api/") && !path.startsWith("/invites"))
      return secure(NextResponse.next());
    const owner = await resolveRequestOwner(request);
    if (
      (path === "/invites" || path.startsWith("/invites/")) &&
      (owner !== "personal" || !trialConfiguration().enabled)
    )
      return secure(NextResponse.redirect(new URL("/", request.url)));
    return secure(NextResponse.next());
  } catch (error) {
    if (path.startsWith("/api/")) return secure(apiError(error));
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return secure(NextResponse.redirect(url));
  }
}
export const config = {
  matcher: [
    "/",
    "/new",
    "/library",
    "/vocabulary",
    "/invites/:path*",
    "/read/:path*",
    "/api/:path*",
  ],
};
