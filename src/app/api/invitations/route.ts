import { NextResponse } from "next/server";
import { z } from "zod";
import { authHandler } from "@/lib/auth-handler";
import { requireAdministrator } from "@/lib/auth-identity";
import { readJson } from "@/lib/errors";
import { createInvitation, listInvitations } from "@/lib/invitations";

export async function GET(request: Request) {
  return authHandler(request, async () => {
    requireAdministrator();
    return NextResponse.json({
      invitations: await listInvitations(),
      legacyInvitationsManaged: false,
    });
  });
}

export async function POST(request: Request) {
  return authHandler(request, async () => {
    requireAdministrator();
    const input = z
      .object({
        label: z.string().trim().min(1, "请填写朋友的备注。 ").max(60),
        requestKey: z.uuid(),
      })
      .strict()
      .parse(await readJson(request, 4096));
    return NextResponse.json(await createInvitation(input), { status: 201 });
  });
}
