import { authHandler } from "@/lib/auth-handler";
import { NextResponse } from "next/server";
import { deleteArticle, getArticle } from "@/lib/repository";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return authHandler(request, async () => {
    return NextResponse.json(await getArticle((await params).id));
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return authHandler(request, async () => {
    await deleteArticle((await params).id);
    return NextResponse.json({ ok: true });
  });
}
