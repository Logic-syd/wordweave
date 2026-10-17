import { NextResponse } from "next/server";
import { z } from "zod";
import { authHandler } from "@/lib/auth-handler";
import { requireAdministrator } from "@/lib/auth-identity";
import { readJson } from "@/lib/errors";
import { changeInvitation } from "@/lib/invitations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return authHandler(request, async () => {
    requireAdministrator();
    const input = z
      .object({ action: z.enum(["revoke", "rotate"]), requestKey: z.uuid() })
      .strict()
      .parse(await readJson(request, 4096));
    const { id } = await params;
    return NextResponse.json(await changeInvitation(id, input));
  });
}
