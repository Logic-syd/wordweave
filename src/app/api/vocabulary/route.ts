import { authHandler } from "@/lib/auth-handler";
import { NextResponse } from "next/server";
import { getReviewTargets, listVocabulary } from "@/lib/repository";
import { AppError } from "@/lib/errors";
export async function GET(request: Request) {
  return authHandler(request, async () => {
    const p = new URL(request.url).searchParams;
    const lang = p.get("language"),
      status = p.get("status");
    if (lang && !["en", "de"].includes(lang)) throw new AppError("语言不合法");
    if (status && !["NEW", "LEARNING", "KNOWN", "IGNORED"].includes(status))
      throw new AppError("状态不合法");
    if (p.get("due") === "true")
      return NextResponse.json(await getReviewTargets(lang ?? "de"));
    return NextResponse.json(
      await listVocabulary(
        lang ?? undefined,
        status ?? undefined,
        p.get("favorite") === "true",
      ),
    );
  });
}
