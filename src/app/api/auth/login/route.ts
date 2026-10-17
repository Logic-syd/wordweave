import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, readJson } from "@/lib/errors";
import { loginIdentity } from "@/lib/auth-identity";
import {
  assertSameOrigin,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/trial-auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { token } = z
      .object({ token: z.string().min(1).max(512) })
      .strict()
      .parse(await readJson(request, 2048));
    const { ownerId, cookie, isAdmin } = await loginIdentity(token);
    const response = NextResponse.json(
      { ok: true, ownerId, isAdmin },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (cookie)
      response.cookies.set(SESSION_COOKIE, cookie, {
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
