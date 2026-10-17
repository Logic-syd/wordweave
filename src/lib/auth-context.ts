import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "./errors";

const ownerContext = new AsyncLocalStorage<string>();

/** Only call with an identity verified by the authentication layer. */
export function runAsOwner<T>(ownerId: string, action: () => T): T {
  return ownerContext.run(ownerId, action);
}

export function currentOwnerId() {
  const owner = ownerContext.getStore();
  if (owner) return owner;
  // CLI development and old local fixtures remain usable; deployed requests
  // must always enter a verified scope, never silently use the personal data.
  if (process.env.NODE_ENV !== "production" && !process.env.TRIAL_ACCESS_TOKENS)
    return "personal";
  throw new AppError("请先使用自己的邀请码登录。", 401);
}

export function captureOwnerCallback<T>(action: () => T): () => T {
  const owner = currentOwnerId();
  return () => runAsOwner(owner, action);
}
