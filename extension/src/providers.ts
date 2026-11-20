export const AI_PROVIDERS = {
  openai: { label: "GPT · OpenAI", baseUrl: "https://api.openai.com/v1" },
  anthropic: {
    label: "Claude · Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
  },
  xai: { label: "Grok · xAI", baseUrl: "https://api.x.ai/v1" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  custom: { label: "自定义 · OpenAI 兼容", baseUrl: "" },
} as const;
export type AIProvider = keyof typeof AI_PROVIDERS;
export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === "string" && Object.hasOwn(AI_PROVIDERS, value);
}
/** Existing configurations retain their provider; new installations make no selection. */
export function inferAIProvider(baseUrl: string): AIProvider | "" {
  if (!baseUrl.trim()) return "";
  const value = baseUrl.replace(/\/+$/, "");
  for (const [id, provider] of Object.entries(AI_PROVIDERS))
    if (
      provider.baseUrl &&
      (value === provider.baseUrl ||
        (id === "deepseek" && value === "https://api.deepseek.com"))
    )
      return id as AIProvider;
  return "custom";
}
export function validateProvider(
  provider: AIProvider | "",
  baseUrl: string,
): AIProvider {
  if (!provider) throw new Error("请选择 API 服务商。");
  if (provider !== "custom" && inferAIProvider(baseUrl) !== provider)
    throw new Error(
      "服务商与 API 地址不一致，请重新选择服务商；其他地址请使用自定义接口。",
    );
  return provider;
}
