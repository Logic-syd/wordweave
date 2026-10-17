import { NextResponse } from "next/server";
import { deleteArticle, getArticle } from "@/lib/repository";
import { apiError } from "@/lib/errors";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    return NextResponse.json(await getArticle((await params).id));
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(_: Request, { params }: Context) {
  try {
    await deleteArticle((await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
