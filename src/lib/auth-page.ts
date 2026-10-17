import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runAsOwner } from "./auth-context";
import { requireRequestOwner } from "./trial-auth";

export async function withPageOwner<T>(
  action: () => Promise<T>,
  path = "/",
): Promise<T> {
  const requestHeaders = new Headers(await headers());
  let owner: string;
  try {
    owner = requireRequestOwner(
      new Request("http://internal.invalid", { headers: requestHeaders }),
    );
  } catch {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  return runAsOwner(owner, action);
}
