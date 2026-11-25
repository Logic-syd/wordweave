import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  isContentRefusal,
  ContentRefusalError,
} from "../src/lib/model-refusal";
import {
  ModelRequestError,
  providerRequestError,
} from "../src/lib/model-errors";
import { readModelResponse } from "../src/lib/generation-limits";

type Call = {
  stage: string;
  id: string;
  model: string;
  completedAt: string;
  inputTokens: number;
  outputTokens: number;
};
type Journal = {
  version: 1;
  attempts: number;
  inputCharacters: number;
  calls: Call[];
  checkpoints: Record<string, unknown>;
};
export class DailyModel {
  private key: string;
  readonly model: string;
  private path: string;
  private journal: Journal;
  private endpoint: string;
  constructor(directory: string) {
    this.key =
      process.env.DAILY_DEEPSEEK_API_KEY || process.env.LLM_API_KEY || "";
    this.model =
      process.env.DAILY_DEEPSEEK_MODEL || process.env.LLM_MODEL || "";
    const base = new URL(
      process.env.DAILY_DEEPSEEK_BASE_URL ||
        process.env.LLM_BASE_URL ||
        "https://api.deepseek.com/v1",
    );
    if (!this.key.trim() || !this.model.trim())
      throw new Error(
        "Configure DAILY_DEEPSEEK_API_KEY and DAILY_DEEPSEEK_MODEL (or the existing LLM_* variables).",
      );
    if (
      base.protocol !== "https:" ||
      base.hostname !== "api.deepseek.com" ||
      base.port ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !["/", "/v1", "/v1/"].includes(base.pathname)
    )
      throw new Error(
        "The daily publisher sends its key only to the official DeepSeek API.",
      );
    this.endpoint = base.href.replace(/\/$/, "") + "/chat/completions";
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, "journal.json");
    this.journal = existsSync(this.path)
      ? JSON.parse(readFileSync(this.path, "utf8"))
      : {
          version: 1,
          attempts: 0,
          inputCharacters: 0,
          calls: [],
          checkpoints: {},
        };
    if (
      this.journal.version !== 1 ||
      !Number.isInteger(this.journal.attempts) ||
      !Array.isArray(this.journal.calls)
    )
      throw new Error("Invalid daily publisher journal.");
  }
  private save() {
    const raw = JSON.stringify(this.journal, null, 2);
    if (raw.includes(this.key))
      throw new Error(
        "Credential found in a model result; publication stopped.",
      );
    writeFileSync(this.path + ".tmp", raw, { mode: 0o600 });
    renameSync(this.path + ".tmp", this.path);
  }
  async checkpoint<T>(
    name: string,
    schema: z.ZodType<T>,
    action: () => Promise<T>,
  ): Promise<T> {
    if (name in this.journal.checkpoints)
      return schema.parse(this.journal.checkpoints[name]);
    const value = schema.parse(await action());
    this.journal.checkpoints[name] = value;
    this.save();
    return value;
  }
  receipt(prefix: string) {
    const calls = this.journal.calls.filter((call) =>
      call.stage.startsWith(prefix),
    );
    if (!calls.length)
      throw new Error(
        "A daily version cannot be published without a real API receipt.",
      );
    return {
      provider: "deepseek" as const,
      model: [...new Set(calls.map((c) => c.model))].join(", "),
      completedAt: calls.at(-1)!.completedAt,
      completionIds: calls.map((c) => c.id),
      inputTokens: calls.reduce((n, c) => n + c.inputTokens, 0),
      outputTokens: calls.reduce((n, c) => n + c.outputTokens, 0),
    };
  }
  statistics() {
    return {
      requests: this.journal.attempts,
      inputTokens: this.journal.calls.reduce((n, c) => n + c.inputTokens, 0),
      outputTokens: this.journal.calls.reduce((n, c) => n + c.outputTokens, 0),
    };
  }
  async request<T>(
    stage: string,
    schema: z.ZodType<T>,
    instruction: string,
    data: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const messages = [
      {
        role: "system",
        content:
          instruction +
          "\nOnly return JSON matching this schema: " +
          JSON.stringify(z.toJSONSchema(schema)),
      },
      { role: "user", content: JSON.stringify(data) },
    ];
    const chars = JSON.stringify(messages).length;
    if (
      this.journal.attempts >= 50 ||
      this.journal.inputCharacters + chars > 1200000 ||
      chars > 160000
    )
      throw new ModelRequestError(
        "Daily model budget exhausted. The last published edition stays available.",
        "quota",
        false,
      );
    this.journal.attempts++;
    this.journal.inputCharacters += chars;
    this.save();
    console.log(`[daily] ${stage}: request ${this.journal.attempts}/50`);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.key}`,
        },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
          : AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.35,
          max_tokens: 12000,
          thinking: { type: "disabled" },
        }),
      });
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name))
      )
        throw new ModelRequestError(
          "Daily model request timed out or was cancelled.",
          "timeout",
          false,
        );
      throw new ModelRequestError(
        "Daily model network connection failed.",
        "network",
        true,
      );
    }
    const body = await readModelResponse(response, 2 * 1024 * 1024);
    if (isContentRefusal(body)) throw new ContentRefusalError();
    if (!response.ok) throw providerRequestError(response, body);
    const result = z
      .object({
        id: z.string().min(1),
        model: z.string(),
        choices: z
          .array(
            z.object({
              finish_reason: z.string(),
              message: z.object({ content: z.string() }),
            }),
          )
          .min(1),
        usage: z.object({
          prompt_tokens: z.number().int().nonnegative(),
          completion_tokens: z.number().int().nonnegative(),
        }),
      })
      .parse(body);
    if (result.choices[0].finish_reason !== "stop")
      throw new ModelRequestError(
        "The daily model output was incomplete.",
        "output_length",
        false,
      );
    if (result.choices[0].message.content.includes(this.key))
      throw new Error(
        "Credential found in model output; stopped without saving it.",
      );
    this.journal.calls.push({
      stage,
      id: result.id,
      model: result.model,
      completedAt: new Date().toISOString(),
      inputTokens: result.usage.prompt_tokens,
      outputTokens: result.usage.completion_tokens,
    });
    this.save();
    try {
      return schema.parse(JSON.parse(result.choices[0].message.content));
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Local, ignored diagnostic only. Never publish malformed model output.
        writeFileSync(
          join(dirname(this.path), "last-invalid-output.txt"),
          result.choices[0].message.content,
          { mode: 0o600 },
        );
        console.log(
          `[daily] invalid JSON: ${result.choices[0].message.content.length} characters, ${result.usage.completion_tokens} output tokens`,
        );
      }
      throw error;
    }
  }
}
