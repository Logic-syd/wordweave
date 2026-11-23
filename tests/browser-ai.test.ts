import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BROWSER_AI_PROVIDERS,
  browserAiProvider,
  browserCompletion,
  clearBrowserAi,
  emptyBrowserAi,
  readBrowserAi,
  saveBrowserAi,
} from "../src/lib/browser-ai";

const config = {
  model: "user-selected-model",
  apiKey: "fixture-user-key",
  thinking: "auto" as const,
};
afterEach(() => vi.unstubAllGlobals());

describe("browser BYOK providers and credential boundaries", () => {
  for (const id of ["openai", "anthropic", "xai", "deepseek"] as const) {
    it(`uses the native ${id} protocol, only the user's key, and no redirects or site proxy`, async () => {
      const anthropic = id === "anthropic";
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            anthropic
              ? {
                  stop_reason: "end_turn",
                  content: [
                    { type: "text", text: '```json\n{"ok":true}\n```' },
                  ],
                }
              : {
                  choices: [
                    {
                      finish_reason: "stop",
                      message: { content: '{"ok":true}' },
                    },
                  ],
                },
          ),
        );
      vi.stubGlobal("fetch", fetcher);
      const baseUrl = BROWSER_AI_PROVIDERS[id].baseUrl;
      await expect(
        browserCompletion("Return JSON", { text: "Article text" }, undefined, {
          ...config,
          baseUrl,
        }),
      ).resolves.toEqual({ ok: true });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(
        `${baseUrl}/${anthropic ? "messages" : "chat/completions"}`,
      );
      expect(init).toMatchObject({
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      const headers = new Headers(init.headers);
      expect(headers.get(anthropic ? "x-api-key" : "authorization")).toBe(
        anthropic ? config.apiKey : `Bearer ${config.apiKey}`,
      );
      expect(headers.has(anthropic ? "authorization" : "x-api-key")).toBe(
        false,
      );
      const body = JSON.parse(init.body);
      expect(body.model).toBe(config.model);
      expect(init.body).not.toContain(config.apiKey);
      if (anthropic) {
        expect(headers.get("anthropic-dangerous-direct-browser-access")).toBe(
          "true",
        );
        expect(body.system).toBe("Return JSON");
        expect(body.messages).toEqual([
          { role: "user", content: '{"text":"Article text"}' },
        ]);
        expect(body.response_format).toBeUndefined();
      }
      if (id === "deepseek")
        expect(body.thinking).toEqual({ type: "disabled" });
    });
  }

  it("blocks invalid and same-origin destinations before sending a key", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("location", { origin: "https://weavie.netlify.app" });
    for (const baseUrl of [
      "http://insecure.example/v1",
      "https://user:pass@api.example/v1",
      "https://api.example/v1?q=key",
      "https://api.example/v1#part",
      "https://weavie.netlify.app/v1",
    ]) {
      await expect(
        browserCompletion("Return JSON", {}, undefined, { ...config, baseUrl }),
      ).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps Claude refusal, truncated output and invalid JSON separate without exposing raw content", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const [stop_reason, text, message] of [
      ["refusal", "", "内容策略"],
      ["max_tokens", '{"ok":', "长度限制"],
      ["end_turn", "I cannot help with that request.", "内容策略"],
      ["end_turn", "invalid JSON containing fixture-user-key", "不是合法 JSON"],
    ]) {
      fetcher.mockResolvedValueOnce(
        Response.json({ stop_reason, content: [{ type: "text", text }] }),
      );
      await expect(
        browserCompletion("Return JSON", {}, undefined, {
          ...config,
          baseUrl: BROWSER_AI_PROVIDERS.anthropic.baseUrl,
        }),
      ).rejects.toThrow(message);
    }
  });

  it("preserves old configurations and switches session/persistent storage without network requests", () => {
    const storage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      };
    };
    const local = storage(),
      session = storage(),
      fetcher = vi.fn();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("fetch", fetcher);
    expect(readBrowserAi()).toEqual(emptyBrowserAi);
    expect(emptyBrowserAi.baseUrl).toBe("");
    const value = { ...config, baseUrl: "https://api.deepseek.com/v1" };
    const key = "wordweave.browser-ai.v1";
    local.setItem(key, JSON.stringify(value));
    expect(browserAiProvider(readBrowserAi().baseUrl)).toBe("deepseek");
    saveBrowserAi(value, false);
    expect(local.getItem(key)).toBeNull();
    expect(readBrowserAi()).toEqual(value);
    saveBrowserAi(value, true);
    expect(session.getItem(key)).toBeNull();
    expect(readBrowserAi()).toEqual(value);
    clearBrowserAi();
    expect(readBrowserAi()).toEqual(emptyBrowserAi);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
