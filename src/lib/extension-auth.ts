import { NextResponse } from "next/server";
import { AppError, apiError } from "./errors";
import { requireRequestOwner } from "./trial-auth";
import { runAsOwner } from "./auth-context";

const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;

export function requireExtensionAuth(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !extensionOrigin.test(origin)) {
    throw new AppError("仅允许浏览器插件访问此接口。", 403);
  }
  // A website cookie alone never grants access to the browser extension API.
  return requireRequestOwner(request, true);
}

export function extensionHeaders(request: Request, response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Origin");
  const origin = request.headers.get("origin");
  if (origin && extensionOrigin.test(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  return response;
}

export function extensionPreflight(request: Request) {
  // Browser preflight requests cannot carry a Bearer token. This response only
  // advertises allowed headers; every actual handler still authenticates.
  const origin = request.headers.get("origin");
  const method = request.headers.get("access-control-request-method");
  const headers = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (
    !origin ||
    !extensionOrigin.test(origin) ||
    !method ||
    !["GET", "POST", "PATCH"].includes(method) ||
    headers.some(
      (header) => !["authorization", "content-type"].includes(header),
    )
  ) {
    return NextResponse.json(
      { error: "请求来源或预检参数不合法。" },
      { status: 403 },
    );
  }
  const response = extensionHeaders(
    request,
    new NextResponse(null, { status: 204 }),
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.headers.set("Access-Control-Max-Age", "600");
  return response;
}

export async function extensionHandler(
  request: Request,
  action: () => Promise<NextResponse>,
) {
  try {
    const owner = requireExtensionAuth(request);
    return extensionHeaders(request, await runAsOwner(owner, action));
  } catch (error) {
    return extensionHeaders(request, apiError(error));
  }
}
