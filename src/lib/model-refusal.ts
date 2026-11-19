import { AppError } from "./app-error";
import type { Generation } from "./schemas";

export class ContentRefusalError extends AppError {
  constructor() {
    super("模型服务因内容策略拒绝了这次请求。原文和已有版本已保留。", 422);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Inspect provider responses, never the article or a guessed sensitive-word list. */
export function isContentRefusal(payload: unknown): boolean {
  const body = record(payload);
  const error = record(body?.error);
  const explicitCodes = new Set([
    "content_filter",
    "content_filter_error",
    "content_policy_violation",
    "content_exists_risk",
    "safety_violation",
  ]);
  if (
    [error?.code, error?.type].some(
      (value) =>
        typeof value === "string" && explicitCodes.has(value.toLowerCase()),
    )
  )
    return true;
  // DeepSeek's observed response is HTTP 400 + invalid_request_error. Neither
  // status nor that generic code is sufficient without this specific message.
  if (
    typeof error?.message === "string" &&
    /^Content Exists Risk\b/i.test(error.message.trim())
  )
    return true;

  const choice = record(
    Array.isArray(body?.choices) ? body.choices[0] : undefined,
  );
  const message = record(choice?.message);
  if (choice?.finish_reason === "content_filter") return true;
  if (typeof message?.refusal === "string" && message.refusal.trim())
    return true;

  // Some providers return a short refusal as a successful plain-text completion.
  // Do not scan structured learning content: it can legitimately quote a refusal.
  const text =
    typeof message?.content === "string" ? message.content.trim() : "";
  if (!text || text.length > 600 || /^[{["`]/.test(text)) return false;
  if (
    /超时|网络|连接|额度|api key|timeout|rate limit|quota|connection/i.test(
      text,
    )
  )
    return false;
  return (
    /^(?:很|非常)?(?:抱歉|对不起)[，,。.!\s]*(?:我)?(?:无法|不能|不便|不提供|不予).{0,100}(?:翻译|处理|回答|协助|提供|讨论)/u.test(
      text,
    ) ||
    /^(?:(?:i(?:'m| am) sorry|sorry)[,!.\s]*)?i (?:cannot|can't|am unable to) (?:help|assist|comply|translate|provide|discuss|respond)\b/i.test(
      text,
    ) ||
    /^sorry,? that(?:'s| is) beyond my current scope\./i.test(text)
  );
}

// Detect an editor's refusal substituted for translation, while allowing an
// article to legitimately quote "I cannot translate/help with this". This is a
// conservative fallback for providers that omit the requested explicit status.
const refusalIntent =
  /(?:我|本助手|本模型)(?:无法|不能|不会|不便|不予|拒绝)(?:为你|为您)?(?:执行|遵循|翻译|生成|提供|帮助|协助|处理|讨论|回应)|\bi (?:cannot|can't|will not|won't|am unable to|refuse to) (?:follow|execute|translate|generate|provide|help|assist|process|discuss|comply)\b|\bich (?:kann|werde|darf).{0,100}\bnicht\b/iu;
export function isParagraphRefusal(
  paragraph: Generation["paragraphs"][number],
  source: string,
): boolean {
  if (paragraph.translationStatus === "refused") return true;
  if (paragraph.segments.some((segment) => segment.type === "term"))
    return false;
  const text = paragraph.segments
    .map((segment) => segment.text)
    .join("")
    .trim();
  if (text.length > 1800 || refusalIntent.test(source)) return false;
  return (
    refusalIntent.test(text) ||
    /(?:该|这)(?:段落|段原文|段内容).{0,50}(?:不提供可用的学习内容|不予翻译|不予处理)/u.test(
      text,
    )
  );
}
