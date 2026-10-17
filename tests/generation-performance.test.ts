import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTranslated } from "../src/lib/generation";
import {
  compactVocabularyContext,
  GenerationRetryBudget,
  readModelResponse,
  thinkingOptions,
  type GenerationProgress,
} from "../src/lib/generation-limits";
import { parseSource } from "../src/lib/markdown";
import { settingsSchema, termSchema } from "../src/lib/schemas";

const settings = settingsSchema.parse({});
function source(count: number) {
  return parseSource(
    Array.from(
      { length: count },
      (_, index) =>
        `Paragraph ${index}. ${"A sentence explaining state updates. ".repeat(90)}`,
    ).join("\n\n"),
  );
}
function requestData(init: RequestInit) {
  const body = JSON.parse(init.body as string);
  return { body, input: JSON.parse(body.messages[1].content).data };
}
function response(input: { paragraphs: { id: string; source: string }[] }) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              title: "状态更新",
              terms: [],
              paragraphs: input.paragraphs.map((paragraph) => ({
                id: paragraph.id,
                segments: [{ type: "text", text: "状态更新的说明。" }],
              })),
            }),
          },
        },
      ],
    }),
  );
}
beforeEach(() => {
  vi.stubEnv("LLM_API_KEY", "fixture-never-a-real-key");
  vi.stubEnv("LLM_BASE_URL", "https://api.deepseek.com/v1");
  vi.stubEnv("LLM_MODEL", "configured-fixture-model");
  vi.stubEnv("LLM_CHUNK_CONCURRENCY", "2");
  vi.stubEnv("LLM_MAX_RETRIES", "2");
  vi.stubEnv("LLM_MAX_OUTPUT_TOKENS", "8192");
  vi.stubEnv("LLM_MAX_RESPONSE_BYTES", "1048576");
  vi.stubEnv("LLM_THINKING", "auto");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("bounded generation pipeline", () => {
  it("runs four equally delayed chunks in two waves, preserving source order and progress", async () => {
    vi.useFakeTimers();
    const blocks = source(4);
    const measurements: {
      concurrency: number;
      elapsed: number;
      peak: number;
      calls: number;
    }[] = [];
    for (const concurrency of [1, 2]) {
      vi.stubEnv("LLM_CHUNK_CONCURRENCY", String(concurrency));
      let active = 0,
        peak = 0,
        calls = 0;
      const progress: GenerationProgress[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: URL, init: RequestInit) => {
          calls++;
          active++;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 100));
          active--;
          return response(requestData(init).input);
        }),
      );
      const start = Date.now();
      const task = generateTranslated(blocks, settings, "tech", {}, undefined, {
        onProgress: (value) => {
          progress.push(value);
        },
      });
      await vi.runAllTimersAsync();
      const generated = await task;
      measurements.push({
        concurrency,
        elapsed: Date.now() - start,
        peak,
        calls,
      });
      expect(generated.paragraphs.map((paragraph) => paragraph.id)).toEqual(
        blocks.map((block) => block.id),
      );
      expect(progress.map((value) => value.completed)).toEqual([0, 1, 2, 3, 4]);
      expect(progress.every((value) => value.total === 4)).toBe(true);
    }
    expect(measurements).toEqual([
      { concurrency: 1, elapsed: 400, peak: 1, calls: 4 },
      { concurrency: 2, elapsed: 200, peak: 2, calls: 4 },
    ]);
  });
  it("retries only a failed chunk and checks original sentences before retaining success", async () => {
    const blocks = source(3);
    const calls = new Map<string, number>();
    const word = termSchema.parse({
      id: "state",
      lemma: "state",
      partOfSpeech: "noun",
      meaning: "状态",
      grammar: {},
      explanation: "程序当前状态。",
      example: "A sentence explaining state updates.",
      exampleTranslation: "说明状态更新的句子。",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init: RequestInit) => {
        const { input } = requestData(init);
        const id = input.paragraphs[0].id;
        calls.set(id, (calls.get(id) ?? 0) + 1);
        if (id === "p0002" && calls.get(id) === 1)
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      title: "状态",
                      terms: [word],
                      paragraphs: [
                        {
                          id,
                          segments: [
                            { type: "text", text: "程序的" },
                            {
                              type: "term",
                              text: "state",
                              termId: "state",
                              meaning: "状态",
                              sentence:
                                "This sentence does not occur in the original.",
                            },
                          ],
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
          );
        return response(input);
      }),
    );
    const generated = await generateTranslated(blocks, settings, "tech", {});
    expect(generated.paragraphs).toHaveLength(3);
    expect(Object.fromEntries(calls)).toEqual({ p0001: 1, p0002: 2, p0003: 1 });
  });
  it("shares a hard retry budget across parallel workers and never retries a chunk more than once", async () => {
    vi.stubEnv("LLM_CHUNK_CONCURRENCY", "3");
    const calls = new Map<string, number>();
    const budget = new GenerationRetryBudget(2);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init: RequestInit) => {
        const id = requestData(init).input.paragraphs[0].id;
        calls.set(id, (calls.get(id) ?? 0) + 1);
        return new Response('{"choices":[{"message":{"content":"{broken"}}]}');
      }),
    );
    await expect(
      generateTranslated(source(3), settings, "tech", {}, undefined, {
        retryBudget: budget,
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(
      [...calls.values()].reduce((sum, count) => sum + count, 0),
    ).toBeLessThanOrEqual(5);
    expect(Math.max(...calls.values())).toBeLessThanOrEqual(2);
    expect(budget.used).toBe(2);
  });
  it("uses configured output limits, forbids redirects, and keeps user settings out of the system prompt", async () => {
    vi.stubEnv("LLM_MAX_OUTPUT_TOKENS", "4096");
    const marker = "UNTRUSTED_TOPIC_DO_NOT_OBEY";
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) =>
      response(requestData(init).input),
    );
    vi.stubGlobal("fetch", fetchMock);
    await generateTranslated(
      parseSource("A complete English paragraph."),
      { ...settings, topic: marker, requestedWords: marker },
      "german",
      {},
    );
    const init = fetchMock.mock.calls[0][1];
    const { body } = requestData(init);
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(body.max_tokens).toBe(4096);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.model).toBe("configured-fixture-model");
    expect(body.messages[0].content).not.toContain(marker);
    expect(body.messages[1].content).toContain(marker);
  });
  it("does not leak German word-count or topic settings into technical translation prompts", async () => {
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) =>
      response(requestData(init).input),
    );
    vi.stubGlobal("fetch", fetchMock);
    await generateTranslated(
      parseSource("A complete English paragraph. SOURCE_ONLY_UNTRUSTED_MARKER"),
      { ...settings, topic: "GERMAN_TOPIC_ONLY" },
      "tech",
      {
        settings,
        reviewTargets: [{ lemma: "Kasse" }],
        existingVocabulary: [],
        sourceIsUntrusted: true,
      },
    );
    const { body, input } = requestData(fetchMock.mock.calls[0][1]);
    expect(input.settings).toEqual({ retention: "medium" });
    expect(input.context).toEqual({
      existingVocabulary: [],
      sourceIsUntrusted: true,
    });
    expect(body.messages[1].content).not.toMatch(
      /newWordCount|requestedWords|reviewTargets|GERMAN_TOPIC_ONLY/,
    );
    expect(body.messages[0].content).not.toContain(
      "SOURCE_ONLY_UNTRUSTED_MARKER",
    );
    expect(body.messages[1].content).toContain("SOURCE_ONLY_UNTRUSTED_MARKER");
  });
  it("does not repeat authentication failures", async () => {
    const fetchMock = vi.fn(
      async () => new Response("denied", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateTranslated(source(1), settings, "tech", {}),
    ).rejects.toThrow("API Key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects a fake learning version with only English prose even when term glosses are Chinese", async () => {
    const sentence =
      "React batches state updates to avoid unnecessary re-renders.";
    const term = termSchema.parse({
      id: "avoid",
      lemma: "avoid unnecessary re-renders",
      partOfSpeech: "phrase",
      meaning: "避免不必要的重新渲染",
      grammar: {},
      explanation: "说明避免多余渲染的目的。",
      example: sentence,
      exampleTranslation: "React 批量处理更新，避免不必要的重新渲染。",
    });
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const input = requestData(init).input;
      if (fetchMock.mock.calls.length > 1) return response(input);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "React",
                  terms: [term],
                  paragraphs: [
                    {
                      id: input.paragraphs[0].id,
                      segments: [
                        {
                          type: "text",
                          text: "React batches state updates to ",
                        },
                        {
                          type: "term",
                          text: term.lemma,
                          termId: term.id,
                          meaning: term.meaning,
                          sentence,
                        },
                      ],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateTranslated(
      parseSource(sentence),
      settings,
      "tech",
      {},
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.paragraphs[0].segments[0].text).toContain("状态更新");
    expect(
      JSON.parse(
        JSON.parse(fetchMock.mock.calls[1][1].body as string).messages[1]
          .content,
      ).validationFeedback,
    ).toContain("中文");
  });
  it("does not require Chinese inside a short heading or a paragraph containing only protected code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init: RequestInit) => {
        const input = requestData(init).input;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "React",
                    terms: [],
                    paragraphs: input.paragraphs.map(
                      (paragraph: { id: string; source: string }) => ({
                        id: paragraph.id,
                        segments: [{ type: "text", text: paragraph.source }],
                      }),
                    ),
                  }),
                },
              },
            ],
          }),
        );
      }),
    );
    const result = await generateTranslated(
      parseSource("# React\n\n`doNotModifyThisCode()`"),
      settings,
      "tech",
      {},
    );
    expect(result.paragraphs[1].segments[0].text).toBe(
      "`doNotModifyThisCode()`",
    );
  });
  it("limits short technical paragraphs to two expressions, or three with high retention", async () => {
    const sentence =
      "React batches state updates to avoid unnecessary re-renders.";
    const terms = [
      "batch",
      "state updates",
      "avoid unnecessary re-renders",
    ].map((lemma, index) =>
      termSchema.parse({
        id: `t${index}`,
        lemma,
        partOfSpeech: "phrase",
        meaning: "状态更新表达",
        grammar: {},
        explanation: "描述状态更新的表达。",
        example: sentence,
        exampleTranslation: "React 批量处理更新，避免多余渲染。",
      }),
    );
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const input = requestData(init).input;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "状态更新",
                  terms,
                  paragraphs: [
                    {
                      id: input.paragraphs[0].id,
                      segments: [
                        {
                          type: "text",
                          text: "React 批量处理更新，以避免多余渲染：",
                        },
                        ...terms.map((term) => ({
                          type: "term",
                          text: term.lemma,
                          termId: term.id,
                          meaning: term.meaning,
                          sentence,
                        })),
                      ],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateTranslated(
        parseSource(sentence),
        settings,
        "tech",
        {},
        undefined,
        { retryBudget: new GenerationRetryBudget(0) },
      ),
    ).rejects.toThrow("最多保留 2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const accepted = await generateTranslated(
      parseSource(sentence),
      { ...settings, retention: "high" },
      "tech",
      {},
    );
    expect(accepted.terms).toHaveLength(3);
  });
  it("limits existing vocabulary to relevant canonical entries without truncating senses", () => {
    const words = Array.from({ length: 300 }, (_, i) => ({
      lemma: `irrelevant-${i}`,
      meaning: "已有义项",
      partOfSpeech: "noun",
      status: "KNOWN",
      extra: "do not send",
    }));
    words.push({
      lemma: "state updates",
      meaning: "状态更新（原有完整义项）",
      partOfSpeech: "phrase",
      status: "KNOWN",
      extra: "do not send",
    });
    const compact = compactVocabularyContext(
      { existingVocabulary: words, reviewTargets: ["kept"] },
      "React batches state updates.",
    ) as { existingVocabulary: unknown[]; reviewTargets: string[] };
    expect(compact.existingVocabulary).toEqual([
      {
        lemma: "state updates",
        meaning: "状态更新（原有完整义项）",
        partOfSpeech: "phrase",
        status: "KNOWN",
      },
    ]);
    expect(compact.reviewTargets).toEqual(["kept"]);
    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(words).length / 20,
    );
    expect(
      (
        compactVocabularyContext({
          existingVocabulary: words,
        }) as typeof compact
      ).existingVocabulary.length,
    ).toBeLessThanOrEqual(80);
  });
  it("caps streamed envelope bytes and cancels an oversized stream without buffering the rest", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(20));
          controller.enqueue(new Uint8Array(20));
        },
        cancel,
      }),
    );
    await expect(readModelResponse(response, 30)).rejects.toThrow(
      "超过大小上限",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    const declared = new Response("small", {
      headers: { "Content-Length": "1000" },
    });
    await expect(readModelResponse(declared, 30)).rejects.toThrow(
      "超过大小上限",
    );
    expect(declared.bodyUsed).toBe(true);
  });
  it("only adds a provider-specific thinking default for DeepSeek's exact host", () => {
    expect(thinkingOptions(new URL("https://api.deepseek.com/v1"))).toEqual({
      thinking: { type: "disabled" },
    });
    expect(thinkingOptions(new URL("https://other.example/v1"))).toEqual({});
    expect(
      thinkingOptions(new URL("https://api.deepseek.com.attacker.example/v1")),
    ).toEqual({});
    vi.stubEnv("LLM_THINKING", "enabled");
    expect(thinkingOptions(new URL("https://other.example/v1"))).toEqual({
      thinking: { type: "enabled" },
    });
  });
});
