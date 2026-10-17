import { NextResponse } from "next/server";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "输入不合法" },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { error: "请求内容不是有效 JSON" },
      { status: 400 },
    );
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "Unknown",
  );
  return NextResponse.json(
    { error: "操作失败，请检查数据库连接或稍后重试。输入和已有版本已保留。" },
    { status: 500 },
  );
}
export async function readJson(request: Request, max = 250000) {
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new AppError("请求内容过长", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("请求内容为空");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new AppError("请求内容过长", 413);
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
}
