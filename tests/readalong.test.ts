import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupEnglish, readArticles } from "../reading/web/local-api";
import { groupUnits } from "../reading/web/learning.js";
import { handleImport } from "../reading/server/import.mjs";

afterEach(() => vi.unstubAllGlobals());

describe("restored Read Along", () => {
  it("restores old article IDs, terms and position without importing stray credentials", () => {
    const [article] = readArticles([
      {
        id: "old-article",
        title: "Coffee",
        text: "A cup of coffee.",
        index: 3,
        vocabulary: [{ text: "coffee", meaning: "咖啡" }],
        apiKey: "must-not-import",
      },
    ]);
    expect(article.id).toBe("old-article");
    expect(article.index).toBe(3);
    expect(article.vocabulary?.[0].text).toBe("coffee");
    expect(article).not.toHaveProperty("apiKey");
    expect(() =>
      readArticles([{ ...article, text: "a".repeat(16001) }]),
    ).toThrow();
    expect(() =>
      readArticles([
        { ...article, vocabulary: [{ text: "", meaning: "bad" }] },
      ]),
    ).toThrow();
  });

  it("free lookup sends only the selection, uses no key, and caches repeat lookups", async () => {
    const fetch = vi.fn(async () =>
      Response.json([[["咖啡店", "coffee shop"]]]),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await lookupEnglish("coffee shop")).toBe("咖啡店");
    expect(await lookupEnglish("coffee shop")).toBe("咖啡店");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.hostname).toBe("translate.googleapis.com");
    expect(url.searchParams.get("q")).toBe("coffee shop");
    expect(new Headers(options.headers).has("Authorization")).toBe(false);
    expect(options.credentials).toBe("omit");
  });

  it("a failed free lookup never falls back to an AI endpoint", async () => {
    const fetch = vi.fn(async () => new Response("limited", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await expect(lookupEnglish("unavailable term")).rejects.toThrow(
      "不会调用 AI",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("paragraph regrouping cannot omit, repeat or change source sentences", () => {
    const original = [
      "First sentence.",
      "Not the second one?",
      "Only if it works.",
    ];
    expect(
      groupUnits(original, [
        { start: 0, end: 1 },
        { start: 2, end: 2 },
      ]).join(" "),
    ).toBe(original.join(" "));
    expect(() =>
      groupUnits(original, [
        { start: 0, end: 0 },
        { start: 2, end: 2 },
      ]),
    ).toThrow();
  });

  it("public URL extraction rejects private hosts, cross-origin calls and redirects", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const request = (url: string, origin = "https://study.example") =>
      new Request("https://study.example/api/readalong/import", {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ url }),
      });
    expect((await handleImport(request("https://127.0.0.1/"))).status).toBe(
      400,
    );
    expect(
      (
        await handleImport(
          request("https://cupofjo.com/article", "https://elsewhere.example"),
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    const behindProxy = new Request(
      "http://localhost:3233/api/readalong/import",
      {
        method: "POST",
        headers: { Origin: "https://study.example", Host: "study.example" },
        body: JSON.stringify({ url: "https://127.0.0.1/private" }),
      },
    );
    expect((await handleImport(behindProxy)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await handleImport(request("https://cupofjo.com/article"))).status,
    ).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
