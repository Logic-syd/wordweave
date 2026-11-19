import { z } from "zod";
import { AppError } from "./app-error";
import { ContentRefusalError, isContentRefusal } from "./model-refusal";
import { ModelRequestError, providerRequestError } from "./model-errors";
import { readModelResponse } from "./generation-limits";
import { generationSchema } from "./schemas";
import { generationPrompt } from "./generation-prompt";
import type { GenerationModel } from "./generation-engine";

const CONFIG_KEY = "wordweave.browser-ai.v1";
export const browserAiSchema = z.object({
  baseUrl: z.string().trim().max(1000),
  model: z.string().trim().max(150),
  apiKey: z.string().trim().max(4096),
  thinking: z.enum(["auto", "disabled", "enabled"]).default("auto"),
});
export type BrowserAiConfig = z.infer<typeof browserAiSchema>;
export const emptyBrowserAi: BrowserAiConfig = {
  baseUrl: "https://api.deepseek.com/v1",
  model: "",
  apiKey: "",
  thinking: "auto",
};
export function readBrowserAi(): BrowserAiConfig {
  if (typeof window === "undefined") return emptyBrowserAi;
  try {
    return browserAiSchema.parse(
      JSON.parse(
        sessionStorage.getItem(CONFIG_KEY) ??
          localStorage.getItem(CONFIG_KEY) ??
          "null",
      ),
    );
  } catch {
    return emptyBrowserAi;
  }
}
export function browserAiReady(config = readBrowserAi()) {
  return Boolean(config.apiKey && config.baseUrl && config.model);
}
export function modelEndpoint(config: BrowserAiConfig) {
  let url: URL;
  try {
    url = new URL(config.baseUrl.replace(/\/+$/, "") + "/chat/completions");
  } catch {
    throw new AppError(
      "请填写完整的 API Base URL，例如 https://api.deepseek.com/v1",
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new AppError(
      "API 地址需要 HTTPS，且不能包含账号、密码、参数或片段；本机模型允许 HTTP。",
    );
  if (typeof location !== "undefined" && url.origin === location.origin)
    throw new AppError("请填写模型服务商的地址。Key 不会发送到语境网站。");
  return url;
}
export function saveBrowserAi(input: BrowserAiConfig, remember: boolean) {
  const config = browserAiSchema.parse(input);
  if (!browserAiReady(config))
    throw new AppError("请填写 API 地址、模型名和自己的 API Key。");
  modelEndpoint(config);
  try {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(CONFIG_KEY, JSON.stringify(config));
    (remember ? sessionStorage : localStorage).removeItem(CONFIG_KEY);
  } catch {
    throw new AppError("浏览器无法保存配置，请允许本站使用本地存储。");
  }
  window.dispatchEvent(new Event("wordweave:ai-config"));
}
export function clearBrowserAi() {
  localStorage.removeItem(CONFIG_KEY);
  sessionStorage.removeItem(CONFIG_KEY);
  window.dispatchEvent(new Event("wordweave:ai-config"));
}
export function browserAiRemembered() {
  return (
    Boolean(localStorage.getItem(CONFIG_KEY)) &&
    !sessionStorage.getItem(CONFIG_KEY)
  );
}

/** Browser -> explicitly configured provider. No application proxy or server key fallback. */
export async function browserCompletion(
  instruction: string,
  data: unknown,
  signal?: AbortSignal,
  config = readBrowserAi(),
): Promise<unknown> {
  if (!browserAiReady(config))
    throw new AppError("请先在「我的 API」中填写自己的 Key 和模型。", 503);
  const url = modelEndpoint(config);
  const thinking =
    config.thinking === "auto"
      ? url.hostname === "api.deepseek.com"
        ? "disabled"
        : undefined
      : config.thinking;
  try {
    const response = await fetch(url.href, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
        : AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: JSON.stringify(data) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 8192,
        ...(thinking ? { thinking: { type: thinking } } : {}),
      }),
    });
    const body = await readModelResponse(response, 1048576).catch((error) => {
      if (response.ok) throw error;
      return null;
    });
    if (isContentRefusal(body)) throw new ContentRefusalError();
    if (!response.ok) throw providerRequestError(response, body);
    const envelope = z
      .object({
        choices: z
          .array(
            z.object({
              finish_reason: z.string().nullish(),
              message: z.object({ content: z.string().nullish() }),
            }),
          )
          .min(1),
      })
      .parse(body);
    if (envelope.choices[0].finish_reason === "length")
      throw new ModelRequestError(
        "回复被长度限制截断，请缩短材料后重试。",
        "output_length",
        false,
      );
    if (
      envelope.choices[0].finish_reason !== "stop" ||
      !envelope.choices[0].message.content
    )
      throw new AppError("模型未返回完整的结构化回复，请重试。", 502);
    return JSON.parse(envelope.choices[0].message.content);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // JSON parser errors may quote the provider's raw content. Do not echo it.
    if (error instanceof SyntaxError)
      throw new SyntaxError(
        "模型回复不是合法 JSON，请确认模型支持结构化输出。",
      );
    if (error instanceof z.ZodError)
      throw new AppError(
        "模型响应结构不完整，请确认接口兼容 Chat Completions。",
        502,
      );
    if (signal?.aborted)
      throw new AppError("请求已停止，原文和已有记录保留。", 504);
    if (error instanceof Error && error.name === "TimeoutError")
      throw new AppError("模型响应超时，输入已保留，可以重试。", 504);
    throw new ModelRequestError(
      "浏览器无法连接模型服务。请检查网络和 API 地址；服务商需允许网页跨域请求（CORS）。不会转用网站的 API。",
      "network",
      false,
    );
  }
}
export function browserGenerationModel(
  config = readBrowserAi(),
): GenerationModel {
  return async (
    instruction,
    data,
    signal,
    validationFeedback,
    beforeModelCall,
  ) => {
    await beforeModelCall?.();
    return generationSchema.parse(
      await browserCompletion(
        generationPrompt + "\n" + instruction,
        { data, validationFeedback },
        signal,
        config,
      ),
    );
  };
}
