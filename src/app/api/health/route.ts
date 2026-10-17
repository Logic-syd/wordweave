import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDatabaseErrorCode } from "@/lib/database-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Read an application table so a reachable but unmigrated database is unready.
    await db.article.findFirst({ select: { id: true } });
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "unavailable", code: getDatabaseErrorCode(error) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
