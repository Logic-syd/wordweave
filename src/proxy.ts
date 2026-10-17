import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
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
