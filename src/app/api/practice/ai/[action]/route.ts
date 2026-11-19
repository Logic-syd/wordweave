import { NextResponse } from "next/server";
import { authHandler } from "@/lib/auth-handler";
import { AppError, readJson } from "@/lib/errors";
import { practiceAi } from "@/lib/practice-ai";
import { assertServerAiEnabled } from "@/lib/server-ai-access";
import { gradeInputSchema, materialInputSchema } from "@/lib/practice-schemas";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  return authHandler(request, async () => {
    assertServerAiEnabled();
    const { action } = await params;
    if (!["grade", "material"].includes(action))
      throw new AppError("功能不存在", 404);
    const input = (
      action === "grade" ? gradeInputSchema : materialInputSchema
    ).parse(await readJson(request, 70000));
    const internal = new Request(request.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: new URL(request.url).origin,
      },
      body: JSON.stringify(input),
    });
    const response = await practiceAi(internal, action);
    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
  });
}
