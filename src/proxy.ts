import { NextRequest, NextResponse } from "next/server";
import {
  extensionHeaders,
  extensionPreflight,
  requireExtensionAuth,
} from "./lib/extension-auth";
import { apiError } from "./lib/errors";
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/extension/")) {
    if (request.method === "OPTIONS") return extensionPreflight(request);
    try {
      requireExtensionAuth(request);
      return extensionHeaders(request, NextResponse.next());
    } catch (error) {
      return extensionHeaders(request, apiError(error));
    }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.get("host"))
          return NextResponse.json(
            { error: "请从当前应用页面提交请求" },
            { status: 403 },
          );
      } catch {
        return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
      }
    }
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
