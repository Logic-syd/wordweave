import type { Metadata } from "next";
import { withAdminPage } from "@/lib/auth-page";
import { Invitations } from "./invitations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "邀请朋友" };

export default async function InvitesPage() {
  return withAdminPage(async () => <Invitations />, "/invites");
}
