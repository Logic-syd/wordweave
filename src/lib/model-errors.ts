import { AppError } from "./app-error";

export type ModelErrorKind =
  | "authentication"
  | "quota"
  | "configuration"
  | "input_length"
  | "rate_limit"
  | "unavailable"
  | "network"
  | "timeout"
  | "output_length";

/** Provider failures are distinct from our own 429 daily quota / 409 task lock. */
export class ModelRequestError extends AppError {
  constructor(
    message: string,
    public kind: ModelErrorKind,
    public retryable: boolean,
    public retryDelayMs = 1000,
  ) {
    super(message, 502);
  }
}

function errorDetails(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload))
    return {};
  const error = payload.error;
  if (!error || typeof error !== "object") return {};
  return {
    code:
      "code" in error && typeof error.code === "string"
        ? error.code.toLowerCase()
        : "",
    type:
      "type" in error && typeof error.type === "string"
        ? error.type.toLowerCase()
        : "",
    message:
      "message" in error && typeof error.message === "string"
        ? error.message.slice(0, 2000)
        : "",
  };
}

function retryAfterMilliseconds(header: string | null, now = Date.now()) {
  if (!header) return undefined;
  const value = header.trim();
  const milliseconds = /^\d+(?:\.\d+)?$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : undefined;
}

/** Never surface provider response bodies: they can echo prompts or credentials. */
export function providerRequestError(
  response: Response,
  payload: unknown,
): ModelRequestError {
  const { code, type, message = "" } = errorDetails(payload);
  const codes = [code, type];
  const status = response.status;
  if (status === 401 || status === 403 || codes.includes("invalid_api_key"))
    return new ModelRequestError(
      "模型服务拒绝访问，请检查配置的 API Key 和模型权限。",
      "authentication",
      false,
    );
  if (
    status === 402 ||
    codes.some(
      (code) =>
        code &&
        [
          "insufficient_quota",
          "insufficient_balance",
          "quota_exceeded",
          "balance_not_enough",
        ].includes(code),
    )
  )
    return new ModelRequestError(
      "模型账户余额或配额不足，请在供应商平台检查余额、账单和账户限额后再试。",
      "quota",
      false,
    );
  if (
    status === 413 ||
    codes.some(
      (code) =>
        code &&
        [
          "context_length_exceeded",
          "input_too_long",
          "max_context_length_exceeded",
        ].includes(code),
    ) ||
    /maximum context length|context length exceeded/i.test(message)
  )
    return new ModelRequestError(
      "材料超过模型的输入长度上限，请减少本次段落数量后重试。",
      "input_length",
      false,
    );
  if (status === 400 || status === 404 || status === 422)
    return new ModelRequestError(
      "模型接口地址、模型名称或请求参数不兼容，请检查配置的 Base URL、模型及 JSON 输出支持。",
      "configuration",
      false,
    );
  const retryAfter = retryAfterMilliseconds(
    response.headers.get("Retry-After"),
  );
  // A long provider cooldown should not tie up a generation slot or be ignored.
  const canWait = retryAfter === undefined || retryAfter <= 10000;
  const delay = Math.max(1000, retryAfter ?? 0);
  if (status === 429)
    return new ModelRequestError(
      canWait
        ? "模型服务暂时限流，请稍后重试。"
        : "模型服务要求较长等待，已停止自动重试，请稍后再生成。",
      "rate_limit",
      canWait,
      delay,
    );
  if (status === 408 || status >= 500)
    return new ModelRequestError(
      canWait
        ? "模型服务暂时不可用，请稍后重试。"
        : "模型服务暂时不可用且要求较长等待，已停止自动重试。",
      "unavailable",
      canWait,
      delay,
    );
  return new ModelRequestError(
    `模型服务返回 ${status}，请检查服务配置或联系供应商。`,
    "configuration",
    false,
  );
}
