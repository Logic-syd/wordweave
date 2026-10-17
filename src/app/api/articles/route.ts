import { authHandler } from "@/lib/auth-handler";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createArticle, listArticles } from "@/lib/repository";
import { AppError, readJson } from "@/lib/errors";
import { importSchema } from "@/lib/schemas";
export async function GET(request: Request) {
  return authHandler(request, async () => {
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode && !["tech", "german"].includes(mode))
      throw new AppError("模式不合法");
    return NextResponse.json(await listArticles(mode ?? undefined));
  });
}
export async function POST(request: Request) {
  return authHandler(request, async () => {
    const data = importSchema.parse(await readJson(request));
    const key = request.headers.get("idempotency-key") ?? randomUUID();
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(key))
      throw new AppError("请求标识不合法");
    const a = await createArticle(data, key);
    return NextResponse.json({ id: a.id }, { status: 201 });
  });
}
