import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AppError, apiError } from "./errors";

const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;

export function requireExtensionAuth(request: Request) {
  const expected = process.env.EXTENSION_ACCESS_TOKEN?.trim();
  if (!expected || expected.length < 32 || /\s/.test(expected)) {
    throw new AppError(
      "服务端尚未配置有效的插件访问令牌（至少 32 个字符）。",
      503,
    );
  }
  const origin = request.headers.get("origin");
  if (origin && !extensionOrigin.test(origin)) {
    throw new AppError("仅允许浏览器插件访问此接口。", 403);
  }
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied ?? "");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new AppError("插件访问令牌无效，请在插件设置中重新填写。", 401);
  }
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
    requireExtensionAuth(request);
  } catch (error) {
    return extensionHeaders(request, apiError(error));
  }
  try {
    return extensionHeaders(request, await action());
  } catch (error) {
    return extensionHeaders(request, apiError(error));
  }
}
