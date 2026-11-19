import { NextResponse } from "next/server";
import { authHandler } from "@/lib/auth-handler";
import { readJson } from "@/lib/errors";
import { getPracticeState, saveStudyItem } from "@/lib/practice-store";
import { studyWriteSchema } from "@/lib/practice-schemas";
export async function GET(request: Request) {
  return authHandler(request, async () =>
    NextResponse.json(await getPracticeState()),
  );
}
export async function PUT(request: Request) {
  return authHandler(request, async () => {
    const input = studyWriteSchema.parse(await readJson(request, 150000));
    const row = await saveStudyItem(input);
    return NextResponse.json({ saved: true, value: row.value });
  });
}
