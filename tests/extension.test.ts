import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  requireExtensionAuth,
  extensionPreflight,
} from "../src/lib/extension-auth";
import { prepareExtensionArticle } from "../src/lib/extension-input";
import { proxy } from "../src/proxy";

const token = "extension-test-token-".repeat(3);
const origin = `chrome-extension://${"a".repeat(32)}`;
function request(
  path = "/api/extension/status",
  headers: Record<string, string> = {},
  method = "GET",
) {
  return new NextRequest(`https://wordweave.example${path}`, {
    method,
    headers: {
      host: "wordweave.example",
      origin,
      authorization: `Bearer ${token}`,
      ...headers,
    },
  });
}
afterEach(() => vi.unstubAllEnvs());

describe("extension authentication boundary", () => {
  it("fails closed when unconfigured and requires the dedicated bearer token", async () => {
    vi.stubEnv("EXTENSION_ACCESS_TOKEN", "");
    vi.stubEnv("ADMIN_ACCESS_TOKEN", "");
    vi.stubEnv("TRIAL_ACCESS_TOKENS", "");
    await expect(requireExtensionAuth(request())).rejects.toThrow(/尚未配置/);
    vi.stubEnv("EXTENSION_ACCESS_TOKEN", token);
    await expect(requireExtensionAuth(request())).resolves.toBe("personal");
    const denied = await proxy(
      request(undefined, { authorization: "Bearer wrong" }),
    );
    expect(denied.status).toBe(401);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(JSON.stringify(await denied.json())).not.toContain(token);
    await expect(
      requireExtensionAuth(request(undefined, { authorization: "" })),
    ).rejects.toThrow(/邀请码无效/);
  });

  it("allows extension preflight without weakening ordinary API origin checks", async () => {
    vi.stubEnv("EXTENSION_ACCESS_TOKEN", token);
    expect(
      (await proxy(request("/api/extension/articles", {}, "POST"))).status,
    ).toBe(200);
    expect((await proxy(request("/api/articles", {}, "POST"))).status).toBe(
      403,
    );
    const evil = await proxy(
      request(
        "/api/extension/articles",
        { origin: "https://untrusted.example" },
        "POST",
      ),
    );
    expect(evil.status).toBe(403);
    expect(evil.headers.has("Access-Control-Allow-Origin")).toBe(false);
    const preflight = extensionPreflight(
      request(
        "/api/extension/articles",
        {
          authorization: "",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type",
        },
        "OPTIONS",
      ),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    expect(preflight.headers.has("Access-Control-Allow-Credentials")).toBe(
      false,
    );
    await expect(
      requireExtensionAuth(
        new Request("https://wordweave.example/api/extension/status", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    ).resolves.toBe("personal");
  });
});

const input = () => ({
  title: "Technical article",
  sourceUrl: "https://example.com/article",
  retention: "medium",
  requestKey: randomUUID(),
  blocks: [
    { id: "b0", markdown: "Use `first()` safely." },
    {
      id: "b1",
      markdown: "Use [the guide](https://example.com) and `second()`.",
    },
  ],
});

describe("web paragraph input and alignment", () => {
  it("preserves supplied IDs and gives protected code/link markers unique namespaces", () => {
    const prepared = prepareExtensionArticle(input());
    expect(prepared.blocks.map((block) => block.id)).toEqual(["b0", "b1"]);
    expect(prepared.blocks[0].protected["⟦PROTECTED_0_0⟧"]).toBe("`first()`");
    expect(prepared.blocks[1].protected["⟦PROTECTED_1_0⟧"]).toBe(
      "[the guide](https://example.com)",
    );
    expect(prepared.blocks[1].masked).not.toContain("second()");
    expect(
      new Set(prepared.blocks.flatMap((block) => Object.keys(block.protected)))
        .size,
    ).toBe(3);
  });

  it("rejects ambiguous/missing blocks and explicit limits without truncation", () => {
    for (const blocks of [
      [],
      [{ id: "b0", markdown: " " }],
      [{ id: "b0", markdown: "One.\n\nTwo." }],
      [
        { id: "b0", markdown: "One." },
        { id: "b0", markdown: "Two." },
      ],
      Array.from({ length: 81 }, (_, index) => ({
        id: `b${index}`,
        markdown: "Text.",
      })),
      [
        { id: "b0", markdown: "a".repeat(11000) },
        { id: "b1", markdown: "b".repeat(10000) },
      ],
    ])
      expect(() => prepareExtensionArticle({ ...input(), blocks })).toThrow();
    expect(() =>
      prepareExtensionArticle({ ...input(), sourceUrl: "javascript:alert(1)" }),
    ).toThrow();
  });

  it("hashes the actual content and settings independently of the idempotency key", () => {
    const original = input();
    const hash = prepareExtensionArticle(original).requestHash;
    expect(
      prepareExtensionArticle({ ...original, requestKey: randomUUID() })
        .requestHash,
    ).toBe(hash);
    expect(
      prepareExtensionArticle({ ...original, retention: "high" }).requestHash,
    ).not.toBe(hash);
  });
});
