import { NextResponse } from "next/server";
import { apiError } from "@/lib/errors";
import { assertSameOrigin, SESSION_COOKIE } from "@/lib/trial-auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
