import {
  aiPermissionPattern,
  DEFAULT_CONFIG,
  normalizeAIBaseUrl,
  sendMessage,
  type ExtensionConfig,
  type GlossMode,
  type Retention,
  type TranslationMode,
} from "./protocol";
import {
  AI_PROVIDERS,
  inferAIProvider,
  isAIProvider,
  validateProvider,
} from "./providers";

const form = document.querySelector<HTMLFormElement>("#config-form")!;
const key = document.querySelector<HTMLInputElement>("#ai-key")!;
const provider = document.querySelector<HTMLSelectElement>("#ai-provider")!;
const base = document.querySelector<HTMLInputElement>("#ai-base-url")!;
const model = document.querySelector<HTMLInputElement>("#ai-model")!;
const level = document.querySelector<HTMLSelectElement>("#retention")!;
const gloss = document.querySelector<HTMLSelectElement>("#gloss-mode")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const test = document.querySelector<HTMLButtonElement>("#test")!;
const modes = [
  ...document.querySelectorAll<HTMLInputElement>(
    'input[name="translation-mode"]',
  ),
];
let savedConfig: ExtensionConfig = { ...DEFAULT_CONFIG };
let ready = false;
let busy = false;
const forget = document.querySelector<HTMLButtonElement>("#forget-key")!;
function showDestination() {
  const destination = document.querySelector<HTMLElement>("#ai-destination")!;
  try {
    const url = new URL(normalizeAIBaseUrl(base.value));
    destination.textContent = `请求发送至：${url.origin}${provider.value === "custom" ? "（你指定的接口会接收 Key 和正文）" : "（官方接口）"}`;
  } catch {
    destination.textContent =
      provider.value === "custom"
        ? "请求发送至：请填写有效的接口地址"
        : "请求发送至：选择服务商后显示";
  }
  document.querySelector<HTMLElement>("#provider-help")!.textContent =
    provider.value === "anthropic"
      ? "使用 Claude 官方 Messages 接口。"
      : "官方服务地址自动填写；自定义接口需兼容 OpenAI 格式。";
}
function clearCredentialForDestinationChange() {
  key.value = "";
  model.value = "";
  document.querySelector("#model-list")!.replaceChildren();
  show("接收地址已更改，请填写对应服务的 Key。");
}
provider.addEventListener("change", () => {
  clearCredentialForDestinationChange();
  base.value = isAIProvider(provider.value)
    ? AI_PROVIDERS[provider.value].baseUrl
    : "";
  base.readOnly = provider.value !== "custom";
  if (provider.value === "custom")
    document.querySelector<HTMLDetailsElement>("#ai-settings details")!.open =
      true;
  showDestination();
});
base.addEventListener("input", () => {
  clearCredentialForDestinationChange();
  showDestination();
});
function updateForget() {
  forget.hidden = !savedConfig.aiApiKey && !savedConfig.accessToken;
}
function setBusy(value: boolean) {
  busy = value;
  save.disabled = value || !ready;
  test.disabled = value;
  forget.disabled = value;
  document.querySelector<HTMLButtonElement>("#clear-cache")!.disabled = value;
  updateMode();
}
function show(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function selectedMode(): TranslationMode {
  return modes.find((radio) => radio.checked)?.value === "ai" ? "ai" : "free";
}
function updateMode() {
  const ai = selectedMode() === "ai";
  form
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
    .forEach((input) => {
      input.disabled = busy || !ready;
    });
  document.querySelector<HTMLElement>("#ai-settings")!.hidden = !ai;
  document.querySelector<HTMLElement>("#free-description")!.hidden = ai;
  key.required = ai;
  provider.required = ai;
  provider.disabled = !ai || busy || !ready;
  base.required = ai;
  key.disabled = !ai || busy || !ready;
  base.disabled = !ai || busy || !ready;
  model.disabled = !ai || busy || !ready;
  test.hidden = !ai;
  save.textContent = ai ? "保存 AI 设置" : "使用免费翻译";
}
function values(): ExtensionConfig {
  const ai = selectedMode() === "ai";
  return {
    ...savedConfig,
    translationMode: selectedMode(),
    aiProvider: ai
      ? validateProvider(
          isAIProvider(provider.value) ? provider.value : "",
          normalizeAIBaseUrl(base.value),
        )
      : savedConfig.aiProvider,
    aiBaseUrl: ai ? normalizeAIBaseUrl(base.value) : savedConfig.aiBaseUrl,
    aiApiKey: ai ? key.value.trim() : savedConfig.aiApiKey,
    aiModel: ai ? model.value.trim() : savedConfig.aiModel,
    retention: level.value as Retention,
    glossMode: gloss.value as GlossMode,
  };
}
modes.forEach((radio) =>
  radio.addEventListener("change", () => {
    updateMode();
    show("");
  }),
);
void sendMessage<ExtensionConfig>({ type: "ww:config:get" })
  .then((config) => {
    savedConfig = {
      ...config,
      aiProvider: config.aiProvider || inferAIProvider(config.aiBaseUrl),
    };
    modes.forEach((radio) => {
      radio.checked = radio.value === config.translationMode;
    });
    key.value = config.aiApiKey;
    provider.value = savedConfig.aiProvider ?? "";
    base.value = config.aiBaseUrl;
    base.readOnly = provider.value !== "custom";
    model.value = config.aiModel;
    level.value = config.retention;
    gloss.value = config.glossMode;
    ready = true;
    save.disabled = false;
    updateForget();
    updateMode();
    showDestination();
  })
  .catch((error: unknown) =>
    show(
      error instanceof Error ? error.message : "无法读取设置，请重新打开。",
      true,
    ),
  );
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ready || busy || !form.reportValidity()) return;
  let next: ExtensionConfig;
  try {
    next = values();
  } catch (error) {
    show(error instanceof Error ? error.message : "请检查 AI 地址。", true);
    return;
  }
  if (
    next.translationMode === "ai" &&
    (!next.aiApiKey || /\s/.test(next.aiApiKey))
  ) {
    show("请填入自己的 API Key，不要包含空格。", true);
    key.focus();
    return;
  }
  setBusy(true);
  // Host access must be requested directly in this user gesture, before any await.
  const permission =
    next.translationMode === "ai"
      ? chrome.permissions.request({
          origins: [aiPermissionPattern(next.aiBaseUrl)],
        })
      : Promise.resolve(true);
  void permission
    .then(async (granted) => {
      if (!granted)
        throw new Error(
          "需要允许连接你的 AI 服务，才能保存。也可以使用免费翻译。",
        );
      await sendMessage({ type: "ww:config:set", config: next });
      savedConfig = next;
      updateForget();
      base.value = next.aiBaseUrl;
      show(
        next.translationMode === "free"
          ? "已保存。打开英文网页，点小精灵就能翻译。"
          : "已保存到本次浏览器会话，尚未发送正文。可以测试连接，或打开英文网页开始翻译。",
      );
    })
    .catch((error: unknown) =>
      show(error instanceof Error ? error.message : "保存失败，请重试。", true),
    )
    .finally(() => {
      setBusy(false);
    });
});
test.addEventListener("click", () => {
  if (!ready || busy) return;
  let current: ExtensionConfig;
  try {
    current = values();
  } catch (error) {
    show(error instanceof Error ? error.message : "请先保存设置。", true);
    return;
  }
  if (JSON.stringify(current) !== JSON.stringify(savedConfig)) {
    show("请先保存修改，再测试连接。", true);
    return;
  }
  setBusy(true);
  show("正在检查 AI 连接…");
  void sendMessage<{ models: string[] }>({ type: "ww:models:list" })
    .then(({ models }) => {
      const list = document.querySelector<HTMLDataListElement>("#model-list")!;
      list.replaceChildren(
        ...models.map((name) => {
          const option = document.createElement("option");
          option.value = name;
          return option;
        }),
      );
      show(
        models.length
          ? `连接成功。${current.aiModel ? "将使用你指定的模型。" : "翻译时会自动选择可用模型。"}`
          : "服务已响应，但没有返回可用模型。请在高级设置中填写服务支持的模型名称。",
        !models.length,
      );
    })
    .catch((error: unknown) =>
      show(
        error instanceof Error ? error.message : "连接失败，请检查 Key。",
        true,
      ),
    )
    .finally(() => {
      setBusy(false);
    });
});
document.querySelector("#clear-cache")!.addEventListener("click", () => {
  if (busy || !window.confirm("清除翻译缓存？下次翻译将重新请求服务。")) return;
  setBusy(true);
  void sendMessage({ type: "ww:cache:clear" })
    .then(() => show("翻译缓存已清除。"))
    .catch((error: unknown) =>
      show(error instanceof Error ? error.message : "清除失败，请重试。", true),
    )
    .finally(() => setBusy(false));
});
updateMode();

forget.addEventListener("click", () => {
  if (
    !ready ||
    busy ||
    !window.confirm("清除 Key 并切回免费翻译？翻译缓存会保留。")
  )
    return;
  setBusy(true);
  const next: ExtensionConfig = {
    ...savedConfig,
    translationMode: "free",
    aiApiKey: "",
    accessToken: "",
  };
  void sendMessage({ type: "ww:config:set", config: next })
    .then(() => {
      savedConfig = next;
      key.value = "";
      modes.forEach((radio) => {
        radio.checked = radio.value === "free";
      });
      updateMode();
      updateForget();
      show(
        "已清除 Key，已切回免费翻译。正在进行的请求可能仍会完成；要停用 Key，请到服务商控制台撤销。",
      );
    })
    .catch((error: unknown) => {
      show(error instanceof Error ? error.message : "删除失败，请重试。", true);
    })
    .finally(() => setBusy(false));
});
