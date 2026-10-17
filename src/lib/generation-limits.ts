import { AppError } from "./errors";

function integer(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new AppError(
      `服务端 ${name} 必须为 ${minimum}–${maximum} 的整数`,
      503,
    );
  return value;
}

export function generationLimits() {
  return {
    concurrency: integer("LLM_CHUNK_CONCURRENCY", 2, 1, 3),
    retries: integer("LLM_MAX_RETRIES", 2, 0, 4),
    outputTokens: integer("LLM_MAX_OUTPUT_TOKENS", 8192, 512, 32768),
    responseBytes: integer("LLM_MAX_RESPONSE_BYTES", 1048576, 16384, 4194304),
  };
}

/** Shared by all chunk workers. Taking a retry is synchronous and atomic in JS. */
export class GenerationRetryBudget {
  private remaining: number;
  used = 0;
  constructor(maximum = generationLimits().retries) {
    this.remaining = maximum;
  }
  take() {
    if (this.remaining <= 0) return false;
    this.remaining--;
    this.used++;
    return true;
  }
}

export type GenerationProgress = {
  stage: "preparing" | "translating" | "validating" | "saving";
  completed: number;
  total: number;
  startedAt?: string;
  updatedAt?: string;
  message?: string;
};
export type ProgressCallback = (
  progress: GenerationProgress,
) => void | Promise<void>;

/** Read a streamed response with a hard byte cap, including oversized envelopes. */
export async function readModelResponse(
  response: Response,
  maximum: number,
): Promise<unknown> {
  if (Number(response.headers.get("content-length") ?? 0) > maximum) {
    await response.body?.cancel();
    throw new AppError(
      "模型响应超过大小上限，已停止接收。请缩短文章或调整服务端限制。",
      502,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("模型没有返回响应正文", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new AppError(
          "模型响应超过大小上限，已停止接收。请缩短文章或调整服务端限制。",
          502,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Only DeepSeek's own origin gets its provider-specific default. No model IDs. */
export function thinkingOptions(url: URL) {
  const mode = process.env.LLM_THINKING || "auto";
  if (!["auto", "enabled", "disabled"].includes(mode))
    throw new AppError(
      "服务端 LLM_THINKING 必须为 auto、enabled 或 disabled",
      503,
    );
  const type =
    mode === "auto"
      ? url.hostname === "api.deepseek.com"
        ? "disabled"
        : undefined
      : mode;
  return type ? { thinking: { type } } : {};
}

type VocabularyContext = {
  lemma: string;
  meaning?: string;
  partOfSpeech?: string;
  status?: string;
};

/** Keep canonical senses intact, but stop repeating hundreds of unrelated entries. */
export function compactVocabularyContext(context: unknown, source = "") {
  if (!context || typeof context !== "object" || Array.isArray(context))
    return context;
  const object = context as Record<string, unknown>;
  if (!Array.isArray(object.existingVocabulary)) return context;
  const words = object.existingVocabulary.filter(
    (word): word is VocabularyContext =>
      !!word && typeof word === "object" && typeof word.lemma === "string",
  );
  const text = source.normalize("NFKC").toLocaleLowerCase();
  const ranked = text
    ? words.filter((word) =>
        text.includes(word.lemma.normalize("NFKC").toLocaleLowerCase()),
      )
    : words;
  const selected: VocabularyContext[] = [];
  let bytes = 0;
  for (const word of ranked) {
    const compact = {
      lemma: word.lemma,
      meaning: word.meaning,
      partOfSpeech: word.partOfSpeech,
      status: word.status,
    };
    const length = JSON.stringify(compact).length;
    if (selected.length >= 80 || bytes + length > 10000) break;
    selected.push(compact);
    bytes += length;
  }
  return { ...object, existingVocabulary: selected };
}

/** Bounded workers preserve input order; one fatal failure aborts sibling fetches. */
export async function parallelChunks<T, R>(
  inputs: T[],
  concurrency: number,
  action: (input: T, index: number, signal: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const combined = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  const results = new Array<R>(inputs.length);
  let next = 0;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
      while (!combined.aborted) {
        const index = next++;
        if (index >= inputs.length) return;
        try {
          results[index] = await action(inputs[index], index, combined);
        } catch (error) {
          if (failure === undefined) failure = error;
          controller.abort();
          return;
        }
      }
    }),
  );
  if (failure !== undefined) throw failure;
  if (signal?.aborted)
    throw new AppError(
      "生成超过四分钟，已停止。原文和已有版本已保留，请拆分长文章或稍后重试。",
      504,
    );
  return results;
}
