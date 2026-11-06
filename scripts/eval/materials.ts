import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  generateTranslated,
  validateArticleOutput,
} from "../../src/lib/generation";
import {
  generationLimits,
  readModelResponse,
} from "../../src/lib/generation-limits";
import {
  parseSource,
  plainSegments,
  type SourceBlock,
} from "../../src/lib/markdown";
import {
  generationSchema,
  settingsSchema,
  type Generation,
} from "../../src/lib/schemas";
import samples from "./samples.json";

const providers = {
  openai: {
    base: "https://api.openai.com/v1",
    model: "gpt-5.4-mini-2026-03-17",
    keyName: "OPENAI_API_KEY",
  },
  deepseek: {
    base: "https://api.deepseek.com/v1",
    model: "deepseek-flash",
    keyName: "DEEPSEEK_API_KEY",
  },
};
type Provider = keyof typeof providers;
type Sample = (typeof samples)[number];

const outputTokens = 3072;
const inputLimit = 16384; // UTF-8 payload bytes plus a conservative allowance for the chat wrapper
const nativeFetch = globalThis.fetch;
const tokenCount = z.number().int().nonnegative();
const usageSchema = z.object({
  prompt_tokens: tokenCount,
  completion_tokens: tokenCount,
  prompt_tokens_details: z
    .object({ cached_tokens: tokenCount.optional() })
    .nullish(),
  prompt_cache_hit_tokens: tokenCount.optional(),
  prompt_cache_miss_tokens: tokenCount.optional(),
});
const envelopeSchema = z.object({
  model: z.string().optional(),
  service_tier: z.string().nullish(),
  usage: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .catch([]),
});

type Cost = { min: number; max: number };
function costFromUsage(provider: Provider, raw: unknown): Cost | null {
  const parsed = usageSchema.safeParse(raw);
  if (!parsed.success) return null;
  const usage = parsed.data;
  const hit =
    provider === "openai"
      ? usage.prompt_tokens_details?.cached_tokens
      : usage.prompt_cache_hit_tokens;
  if (hit === undefined || hit > usage.prompt_tokens) return null;
  const miss = usage.prompt_tokens - hit;
  if (
    provider === "deepseek" &&
    usage.prompt_cache_miss_tokens !== undefined &&
    usage.prompt_cache_miss_tokens !== miss
  )
    return null;
  const price = (input: number, cached: number, output: number) =>
    (miss * input + hit * cached + usage.completion_tokens * output) /
    1_000_000;
  if (provider === "openai") {
    const amount = price(0.75, 0.075, 4.5);
    return { min: amount, max: amount };
  }
  return { min: price(0.15, 0.003, 0.6), max: price(0.3, 0.006, 1.2) };
}

function qualityChecks(
  sample: Sample,
  blocks: SourceBlock[],
  result: Generation,
) {
  const terms = result.terms;
  const termSegments = result.paragraphs.flatMap((p) =>
    p.segments.filter((s) => s.type === "term"),
  );
  const han = (s: string) => /\p{Script=Han}/u.test(s);
  const normalize = (s: string) =>
    s
      .replaceAll(/`+/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  const splitter = new Intl.Segmenter(sample.mode === "german" ? "de" : "en", {
    granularity: "sentence",
  });
  const checks: Record<string, boolean> = {
    sourceOrderAndText:
      blocks.length === result.paragraphs.length &&
      blocks.every((b, i) => {
        const p = result.paragraphs[i];
        return p.id === b.id && p.original === b.original;
      }),
    fencedCode: blocks.every(
      (b, i) =>
        b.kind !== "code" ||
        plainSegments(result.paragraphs[i].segments) === b.original,
    ),
    allCardsUsed:
      terms.length > 0 &&
      terms.every((t) => termSegments.some((s) => s.termId === t.id)),
    fullSourceSentences: result.paragraphs.every((p) => {
      const sentences = [...splitter.segment(normalize(p.original ?? ""))].map(
        (s) => s.segment.trim(),
      );
      return p.segments.every(
        (s) => s.type === "text" || sentences.includes(normalize(s.sentence)),
      );
    }),
    chineseProse: result.paragraphs.every(
      (p, i) =>
        blocks[i].kind === "code" ||
        han(
          p.segments
            .filter((s) => s.type === "text")
            .map((s) => s.text)
            .join(""),
        ),
    ),
    chineseGlossesAndExplanations:
      terms.every((t) =>
        [t.meaning, t.explanation, t.exampleTranslation].every(han),
      ) && termSegments.every((s) => han(s.meaning)),
  };
  if (sample.mode === "german") {
    const ticket = terms.find((t) => t.lemma === "Fahrkarte");
    const depart = terms.find((t) => t.lemma === "abfahren");
    checks.fahrkarteGenderAndPlural =
      ticket?.partOfSpeech === "noun" &&
      ticket.grammar.article === "die" &&
      ticket.grammar.plural.trim() === "die Fahrkarten";
    checks.abfahrenInflection =
      depart?.partOfSpeech === "verb" &&
      depart.grammar.infinitive === "abfahren" &&
      /fährt/i.test(depart.grammar.currentForm) &&
      /\bab\b/i.test(
        [
          depart.grammar.currentForm,
          depart.grammar.note,
          depart.explanation,
        ].join(" "),
      );
  }
  return checks;
}

type Attempt = {
  dispatched: boolean;
  startedAt: string;
  requestBytes: number;
  status?: number;
  requestId?: string | null;
  elapsedMs?: number;
  model?: string;
  finishReason?: string | null;
  usage?: unknown;
  rawContent?: string | null;
  jsonObject?: boolean;
  schemaValid?: boolean;
  estimatedUsd: Cost | null;
};

async function runSample(provider: Provider, sample: Sample, live: boolean) {
  const attempts: Attempt[] = [];
  const spec = providers[provider];
  const settings = settingsSchema.parse(sample.settings);
  const blocks = parseSource(sample.source);
  const context = {
    settings,
    existingVocabulary: [],
    reviewTargets: [],
    sourceIsUntrusted: true,
  };
  const entry = {
    name: sample.name,
    source: sample.source,
    settings,
    manualReview: sample.review,
    attempts,
  };
  // Observe the production request at the transport boundary. Neither headers nor request
  // keys are copied into the report. A fixture response can only be selected in offline mode.
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), spec.base + "/chat/completions");
    assert.equal(init?.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(attempts.length, 0, "One request per sample");
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, spec.model);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(
      body[provider === "openai" ? "max_completion_tokens" : "max_tokens"],
      outputTokens,
    );
    const requestBytes = Buffer.byteLength(String(init.body), "utf8");
    assert.ok(requestBytes + 256 <= inputLimit, "Input cap exceeded");
    const attempt: Attempt = {
      dispatched: live,
      startedAt: new Date().toISOString(),
      requestBytes,
      estimatedUsd: null,
    };
    attempts.push(attempt);
    const start = performance.now();
    try {
      const response = live
        ? await nativeFetch(url, init)
        : Response.json({
            model: "offline-fixture",
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(sample.fixture) },
              },
            ],
          });
      attempt.status = response.status;
      attempt.requestId = response.headers.get("x-request-id");
      if (!response.ok) return response; // Do not save provider errors that might echo a credential.
      const raw = await readModelResponse(
        response,
        generationLimits().responseBytes,
      );
      const parsed = envelopeSchema.safeParse(raw);
      if (parsed.success) {
        const { model, choices, usage, service_tier } = parsed.data;
        const first = choices[0];
        attempt.model = model;
        attempt.usage = usage;
        attempt.finishReason = first?.finish_reason;
        attempt.rawContent = first?.message.content;
        const standardPrice =
          provider !== "openai" ||
          (model === spec.model &&
            (!service_tier || service_tier === "default"));
        if (live && standardPrice)
          attempt.estimatedUsd = costFromUsage(provider, usage);
        try {
          const obj = JSON.parse(attempt.rawContent ?? "");
          attempt.jsonObject =
            !!obj && typeof obj === "object" && !Array.isArray(obj);
          attempt.schemaValid = generationSchema.safeParse(obj).success;
        } catch {
          attempt.jsonObject = false;
          attempt.schemaValid = false;
        }
      }
      return Response.json(raw, { status: response.status });
    } finally {
      attempt.elapsedMs = Math.round(performance.now() - start);
    }
  };
  try {
    const result = await generateTranslated(
      blocks,
      settings,
      sample.mode,
      context,
      AbortSignal.timeout(240_000),
      {
        validate: (r) =>
          validateArticleOutput(r, settings, sample.mode, [], []),
      },
    );
    const checks = qualityChecks(sample, blocks, result);
    return {
      ...entry,
      acceptedByGenerator: true,
      checks,
      result,
      passed: Object.values(checks).every(Boolean),
    };
  } catch (err) {
    return {
      ...entry,
      acceptedByGenerator: false,
      passed: false,
      error: err instanceof Error ? err.message : "Generation failed",
    };
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

async function main() {
  const mode = process.argv[2] ?? "offline";
  assert.ok(
    ["offline", "openai", "deepseek"].includes(mode) &&
      process.argv.length <= 3,
    "Use npm run eval:materials -- offline|openai|deepseek",
  );
  const live = mode !== "offline";
  const selected: Provider[] =
    mode === "offline" ? ["openai", "deepseek"] : [mode as Provider];
  const base = process.env.LLM_BASE_URL?.replace(/\/+$/, "");
  const genericKey = process.env.LLM_API_KEY;
  Object.assign(process.env, {
    LLM_CHUNK_CONCURRENCY: "1",
    LLM_MAX_RETRIES: "0",
    LLM_MAX_OUTPUT_TOKENS: String(outputTokens),
    LLM_MAX_RESPONSE_BYTES: "1048576",
    LLM_THINKING: "auto",
  });

  for (const provider of selected) {
    const spec = providers[provider];
    const key = live
      ? process.env[spec.keyName] ||
        (base === spec.base ? genericKey : undefined)
      : "offline-fixture";
    if (!key) {
      throw new Error(
        spec.keyName + " missing for " + spec.base + ". No model request sent.",
      );
    }
    Object.assign(process.env, {
      LLM_API_KEY: key,
      LLM_BASE_URL: spec.base,
      LLM_MODEL: spec.model,
    });
    const dir = ".local/model-eval";
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = join(
      dir,
      [
        new Date().toISOString().replace(/[:.]/g, "-"),
        mode,
        provider,
        randomUUID().slice(0, 8),
      ].join("_") + ".json",
    );
    const cases: Awaited<ReturnType<typeof runSample>>[] = [];
    for (const sample of samples) {
      const output = await runSample(provider, sample, live);
      cases.push(output);
      const sent = cases.flatMap((c) => c.attempts).filter((a) => a.dispatched);
      let total: Cost | null = { min: 0, max: 0 };
      for (const attempt of sent) {
        if (!attempt.estimatedUsd) {
          total = null;
          break;
        }
        total.min += attempt.estimatedUsd.min;
        total.max += attempt.estimatedUsd.max;
      }
      const report = {
        mode,
        provider,
        model: spec.model,
        pricingAsOf: "2026-11-06",
        outputTokenCap: outputTokens,
        liveRequests: sent.length,
        estimatedUsd: total,
        complete: cases.length === samples.length,
        cases,
      };
      writeFileSync(path + ".tmp", JSON.stringify(report, null, 2) + "\n", {
        mode: 0o600,
      });
      renameSync(path + ".tmp", path);
      console.log(
        sample.name,
        output.passed ? "PASS" : "FAIL",
        "·",
        mode,
        "·",
        provider,
        "·",
        sent.length,
        "live requests so far · cumulative USD",
        total ?? "unknown (see usage)",
      );
      if (!output.passed) process.exitCode = 1;
      if (
        output.attempts.some(
          (a) => a.status && [401, 403, 404, 429].includes(a.status),
        )
      )
        break;
    }
    console.log("Report:", path);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
