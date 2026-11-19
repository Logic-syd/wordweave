import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { providerRequestError } from "../src/lib/model-errors";
import { generateTranslated } from "../src/lib/generation";
import { parseSource } from "../src/lib/markdown";
import { settingsSchema } from "../src/lib/schemas";
import type { GenerationProgress } from "../src/lib/generation-limits";

const settings = settingsSchema.parse({});
const blocks = parseSource("A normal paragraph about state updates.");
function success() {
  return Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            title: "状态更新",
            terms: [],
            paragraphs: [
              {
                id: "p0001",
                segments: [{ type: "text", text: "状态更新的说明。" }],
              },
            ],
          }),
        },
      },
    ],
  });
}
beforeEach(() => {
  vi.stubEnv("LLM_API_KEY", "fixture-key");
  vi.stubEnv("LLM_BASE_URL", "https://api.deepseek.com/v1");
  vi.stubEnv("LLM_MODEL", "configured-fixture-model");
  vi.stubEnv("LLM_MAX_RETRIES", "2");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("actionable provider failures", () => {
  it("separates authentication, billing, input length and configuration without echoing error bodies", () => {
    const secret = "fixture-credential-not-for-the-browser";
    for (const [status, code, kind] of [
      [401, "invalid_api_key", "authentication"],
      [403, "", "authentication"],
      [402, "", "quota"],
      [429, "insufficient_quota", "quota"],
      [400, "context_length_exceeded", "input_length"],
      [413, "", "input_length"],
      [404, "model_not_found", "configuration"],
      [400, "invalid_request_error", "configuration"],
    ] as const) {
      const error = providerRequestError(new Response(null, { status }), {
        error: { code, message: secret },
      });
      expect(error.kind).toBe(kind);
      expect(error.retryable).toBe(false);
      expect(error.message).not.toContain(secret);
    }
  });
  it("honors short numeric/date Retry-After and declines long cooldowns", () => {
    const error = (status: number, after: string) =>
      providerRequestError(
        new Response(null, { status, headers: { "Retry-After": after } }),
        {},
      );
    expect(error(429, "3")).toMatchObject({
      kind: "rate_limit",
      retryable: true,
      retryDelayMs: 3000,
    });
    const future = new Date(Date.now() + 6000).toUTCString();
    const dated = error(503, future);
    expect(dated.retryable).toBe(true);
    expect(dated.retryDelayMs).toBeGreaterThan(4000);
    expect(dated.retryDelayMs).toBeLessThanOrEqual(6000);
    expect(error(429, "120").retryable).toBe(false);
    expect(error(503, "120").retryable).toBe(false);
    expect(error(429, "not-a-date")).toMatchObject({
      retryable: true,
      retryDelayMs: 1000,
    });
  });
  it("waits before retrying rate limits, shows progress and reserves each actual provider request", async () => {
    const times: number[] = [];
    const progress: GenerationProgress[] = [];
    const beforeModelCall = vi.fn(async () => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(Date.now());
        return times.length === 1
          ? new Response("rate limited", {
              status: 429,
              headers: { "Retry-After": "1" },
            })
          : success();
      }),
    );
    const result = await generateTranslated(
      blocks,
      settings,
      "tech",
      {},
      undefined,
      {
        beforeModelCall,
        onProgress: (value) => {
          progress.push(value);
        },
      },
    );
    expect(result.paragraphs).toHaveLength(1);
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(990);
    expect(beforeModelCall).toHaveBeenCalledTimes(2);
    expect(
      progress.some(
        (value) =>
          value.message?.includes("限流") && value.message.includes("等待"),
      ),
    ).toBe(true);
  });
  it("cancels backoff without issuing another request", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      generateTranslated(blocks, settings, "tech", {}, controller.signal, {
        onProgress: (progress) => {
          if (progress.message?.includes("等待")) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ status: 504 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not waste another call on insufficient balance, long cooldowns or truncated output", async () => {
    for (const make of [
      () =>
        Response.json(
          { error: { code: "insufficient_quota" } },
          { status: 429 },
        ),
      () =>
        new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
      () =>
        Response.json({
          choices: [
            { finish_reason: "length", message: { content: "{truncated" } },
          ],
        }),
      () =>
        Response.json({
          choices: [{ finish_reason: "length", message: { content: null } }],
        }),
    ]) {
      const fetcher = vi.fn(async () => make());
      vi.stubGlobal("fetch", fetcher);
      await expect(
        generateTranslated(blocks, settings, "tech", {}),
      ).rejects.toMatchObject({ status: 502, retryable: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it.each([
    ["network", () => new TypeError("private low-level connection details")],
    [
      "timeout",
      () => new DOMException("private timeout details", "TimeoutError"),
    ],
  ] as const)(
    "retries %s once and returns a safe, specific error",
    async (kind, make) => {
      const fetcher = vi.fn(async () => {
        throw make();
      });
      vi.stubGlobal("fetch", fetcher);
      await expect(
        generateTranslated(blocks, settings, "tech", {}),
      ).rejects.toMatchObject({ kind, status: 502 });
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
});
