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

const form = document.querySelector<HTMLFormElement>("#config-form")!;
const key = document.querySelector<HTMLInputElement>("#ai-key")!;
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
function show(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function selectedMode(): TranslationMode {
  return modes.find((radio) => radio.checked)?.value === "ai" ? "ai" : "free";
}
function updateMode() {
  const ai = selectedMode() === "ai";
  document.querySelector<HTMLElement>("#ai-settings")!.hidden = !ai;
  document.querySelector<HTMLElement>("#free-description")!.hidden = ai;
  key.required = ai;
  base.required = ai;
  key.disabled = !ai;
  base.disabled = !ai;
  model.disabled = !ai;
  test.hidden = !ai;
  save.textContent = ai ? "保存 AI 设置" : "使用免费翻译";
}
function values(): ExtensionConfig {
  const ai = selectedMode() === "ai";
  return {
    ...savedConfig,
    translationMode: selectedMode(),
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
    savedConfig = config;
    modes.forEach((radio) => {
      radio.checked = radio.value === config.translationMode;
    });
    key.value = config.aiApiKey;
    base.value = config.aiBaseUrl;
    model.value = config.aiModel;
    level.value = config.retention;
    gloss.value = config.glossMode;
    ready = true;
    save.disabled = false;
    updateMode();
  })
  .catch((error: unknown) =>
    show(
      error instanceof Error ? error.message : "无法读取设置，请重新打开。",
      true,
    ),
  );
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ready || !form.reportValidity()) return;
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
  save.disabled = true;
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
      base.value = next.aiBaseUrl;
      show(
        next.translationMode === "free"
          ? "已保存。打开英文网页，点小精灵就能翻译。"
          : "已保存。可以测试连接，或打开英文网页开始翻译。",
      );
    })
    .catch((error: unknown) =>
      show(error instanceof Error ? error.message : "保存失败，请重试。", true),
    )
    .finally(() => {
      save.disabled = false;
    });
});
test.addEventListener("click", () => {
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
  test.disabled = true;
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
      test.disabled = false;
    });
});
document.querySelector("#library")!.addEventListener("click", () => {
  void sendMessage({ type: "ww:library:open" });
});
updateMode();
