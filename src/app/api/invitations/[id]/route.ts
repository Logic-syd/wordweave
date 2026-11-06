import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    { error: "当前为个人版，邀请功能已停用。" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
export const PATCH = retired;
