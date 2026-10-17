import { NextRequest, NextResponse } from "next/server";
import {
  extensionHeaders,
  extensionPreflight,
  requireExtensionAuth,
} from "./lib/extension-auth";
import { apiError } from "./lib/errors";
import { assertSameOrigin, requireRequestOwner } from "./lib/trial-auth";

function secure(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/extension/")) {
    if (request.method === "OPTIONS")
      return secure(extensionPreflight(request));
    try {
      requireExtensionAuth(request);
      return secure(extensionHeaders(request, NextResponse.next()));
    } catch (error) {
      return secure(extensionHeaders(request, apiError(error)));
    }
  }
  try {
    assertSameOrigin(request);
    if (path === "/api/health" || path.startsWith("/api/auth/"))
      return secure(NextResponse.next());
    requireRequestOwner(request);
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
    "/read/:path*",
    "/api/:path*",
  ],
};
