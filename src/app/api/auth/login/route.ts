import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, apiError, readJson } from "@/lib/errors";
import {
  assertSameOrigin,
  createSession,
  ownerForToken,
  SESSION_COOKIE,
  SESSION_SECONDS,
  trialConfiguration,
} from "@/lib/trial-auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { token } = z
      .object({ token: z.string().min(1).max(512) })
      .strict()
      .parse(await readJson(request, 2048));
    if (!trialConfiguration().enabled)
      return NextResponse.json(
        { ok: true, ownerId: "personal" },
        { headers: { "Cache-Control": "no-store" } },
      );
    const ownerId = ownerForToken(token);
    if (!ownerId) throw new AppError("邀请码无效或已撤销，请检查后重试。", 401);
    const response = NextResponse.json(
      { ok: true, ownerId },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, createSession(ownerId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
