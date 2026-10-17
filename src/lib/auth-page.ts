import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { runAsOwner } from "./auth-context";
import { resolveRequestOwner, requireAdministrator } from "./auth-identity";

export async function withPageOwner<T>(
  action: () => Promise<T>,
  path = "/",
): Promise<T> {
  const requestHeaders = new Headers(await headers());
  let owner: string;
  try {
    owner = await resolveRequestOwner(
      new Request("http://internal.invalid", { headers: requestHeaders }),
    );
  } catch {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  return runAsOwner(owner, action);
}

export async function withAdminPage<T>(
  action: () => Promise<T>,
  path = "/invites",
) {
  return withPageOwner(async () => {
    try {
      requireAdministrator();
    } catch {
      notFound();
    }
    return action();
  }, path);
}
