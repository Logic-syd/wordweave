import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { runAsOwner } from "./auth-context";
import {
  resolveRequestOwner,
  requireAdministrator,
  optionalRequestOwner,
} from "./auth-identity";

/** Public pages may load private data only inside a verified owner scope. */
export async function withOptionalPageOwner<T>(
  action: (owner: string | null) => Promise<T>,
): Promise<T> {
  const owner = await optionalRequestOwner(
    new Request("http://internal.invalid", {
      headers: new Headers(await headers()),
    }),
  );
  return owner ? runAsOwner(owner, () => action(owner)) : action(null);
}

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
