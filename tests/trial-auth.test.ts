import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  captureOwnerCallback,
  currentOwnerId,
  runAsOwner,
} from "../src/lib/auth-context";
import {
  assertSameOrigin,
  createSession,
  ownerForSession,
  ownerForToken,
  requireRequestOwner,
  SESSION_COOKIE,
  SESSION_SECONDS,
  trialConfiguration,
} from "../src/lib/trial-auth";
import {
  extensionHandler,
  requireExtensionAuth,
} from "../src/lib/extension-auth";
import { NextResponse } from "next/server";
import { proxy } from "../src/proxy";

const personal = "p".repeat(64);
const friend = "f".repeat(64);
const tokens = JSON.stringify({ personal, friend_anna: friend });
const env = { NODE_ENV: "production", TRIAL_ACCESS_TOKENS: tokens };
function configured() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TRIAL_ACCESS_TOKENS", tokens);
  vi.stubEnv("EXTENSION_ACCESS_TOKEN", "");
}
afterEach(() => vi.unstubAllEnvs());

describe("trial identities and signed sessions", () => {
  it("fails closed in production even with a legacy extension token, but keeps local development usable", () => {
    expect(() =>
      ownerForToken(personal, {
        NODE_ENV: "production",
        EXTENSION_ACCESS_TOKEN: personal,
      }),
    ).toThrow(/TRIAL_ACCESS_TOKENS/);
    expect(() =>
      trialConfiguration({ ...env, TRIAL_ACCESS_TOKENS: "{broken" }),
    ).toThrow(/TRIAL_ACCESS_TOKENS/);
    expect(() =>
      trialConfiguration({
        ...env,
        TRIAL_ACCESS_TOKENS: JSON.stringify({ a: personal, b: personal }),
      }),
    ).toThrow();
    expect(() =>
      trialConfiguration({
        ...env,
        TRIAL_ACCESS_TOKENS: JSON.stringify({ personal: "too-short" }),
      }),
    ).toThrow();
    expect(
      requireRequestOwner(new Request("http://localhost"), false, {
        NODE_ENV: "development",
      }),
    ).toBe("personal");
    configured();
    vi.stubEnv("TRIAL_ACCESS_TOKENS", "");
    const denied = proxy(new NextRequest("https://example.test/api/articles"));
    expect(denied.status).toBe(503);
    expect(
      proxy(new NextRequest("https://example.test/")).headers.get("location"),
    ).toContain("/login");
  });

  it("maps separate tokens to separate owners and keeps legacy personal aliases bounded by active configuration", () => {
    expect(ownerForToken(personal, env)).toBe("personal");
    expect(ownerForToken(friend, env)).toBe("friend_anna");
    const legacy = "old".repeat(24);
    expect(
      ownerForToken(legacy, { ...env, EXTENSION_ACCESS_TOKEN: legacy }),
    ).toBe("personal");
    expect(
      ownerForToken(personal, { ...env, EXTENSION_ACCESS_TOKEN: personal }),
    ).toBe("personal");
    expect(
      ownerForToken(legacy, {
        ...env,
        TRIAL_ACCESS_TOKENS: JSON.stringify({ friend_anna: friend }),
        EXTENSION_ACCESS_TOKEN: legacy,
      }),
    ).toBeNull();
    expect(() =>
      ownerForToken(friend, { ...env, EXTENSION_ACCESS_TOKEN: friend }),
    ).toThrow();
    expect(ownerForToken("z".repeat(64), env)).toBeNull();
  });

  it("signs an expiring cookie without the raw token and rejects tampering, rotation and removed owners", () => {
    const now = Date.now();
    const cookie = createSession("friend_anna", env, now);
    expect(cookie).not.toContain(friend);
    expect(
      Buffer.from(cookie.split(".")[0], "base64url").toString(),
    ).not.toContain(friend);
    expect(ownerForSession(cookie, env, now + 1)).toBe("friend_anna");
    expect(
      ownerForSession(cookie, env, now + SESSION_SECONDS * 1000),
    ).toBeNull();
    const [payload, signature] = cookie.split(".");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    const forged = Buffer.from(
      JSON.stringify({ ...data, owner: "personal" }),
    ).toString("base64url");
    expect(ownerForSession(`${forged}.${signature}`, env, now)).toBeNull();
    expect(
      ownerForSession(
        cookie,
        {
          ...env,
          TRIAL_ACCESS_TOKENS: JSON.stringify({
            personal,
            friend_anna: "r".repeat(64),
          }),
        },
        now,
      ),
    ).toBeNull();
    expect(
      ownerForSession(
        cookie,
        { ...env, TRIAL_ACCESS_TOKENS: JSON.stringify({ personal }) },
        now,
      ),
    ).toBeNull();
  });

  it("requires bearer auth for extension routes and never trusts owner headers", async () => {
    configured();
    const cookie = createSession("friend_anna");
    const request = new Request("https://app.test/api/extension/status", {
      headers: {
        cookie: `${SESSION_COOKIE}=${cookie}`,
        "x-owner-id": "personal",
      },
    });
    expect(requireRequestOwner(request)).toBe("friend_anna");
    expect(() => requireExtensionAuth(request)).toThrow();
    const bearer = new Request(request.url, {
      headers: {
        authorization: `Bearer ${friend}`,
        "x-owner-id": "personal",
        origin: `chrome-extension://${"a".repeat(32)}`,
      },
    });
    const response = await extensionHandler(bearer, async () =>
      NextResponse.json({ owner: currentOwnerId() }),
    );
    expect(await response.json()).toEqual({ owner: "friend_anna" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(() => currentOwnerId()).toThrow();
  });

  it("isolates concurrent asynchronous scopes and captures background ownership outside the request", async () => {
    configured();
    const delayed = runAsOwner("friend_anna", () =>
      captureOwnerCallback(async () => {
        await Promise.resolve();
        return currentOwnerId();
      }),
    );
    const owners = await Promise.all([
      runAsOwner("personal", async () => {
        await Promise.resolve();
        return currentOwnerId();
      }),
      runAsOwner("friend_anna", async () => {
        await Promise.resolve();
        return currentOwnerId();
      }),
      delayed(),
    ]);
    expect(owners).toEqual(["personal", "friend_anna", "friend_anna"]);
    expect(() => currentOwnerId()).toThrow();
  });
});

describe("browser mutation origins", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://127.0.0.1:8080/api/articles", {
      method: "POST",
      headers: { host: "wordweave-production.up.railway.app", ...headers },
    });
  it("supports Railway TLS termination while rejecting cross-host origins and cross-site requests", () => {
    expect(() =>
      assertSameOrigin(
        request({
          origin: "https://wordweave-production.up.railway.app",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(request({ origin: "https://evil.example" })),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        request({
          origin: "https://wordweave-production.up.railway.app",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toThrow();
    expect(() => assertSameOrigin(request({ origin: "null" }))).toThrow();
    expect(() =>
      assertSameOrigin(request({ "sec-fetch-site": "same-site" })),
    ).toThrow();
    expect(() =>
      assertSameOrigin(request({ "sec-fetch-site": "same-origin" })),
    ).not.toThrow();
    expect(() => assertSameOrigin(request({}))).not.toThrow();
  });
});
