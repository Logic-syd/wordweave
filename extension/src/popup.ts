import {
  sendMessage,
  type ContentMessage,
  type ExtensionConfig,
  type Retention,
} from "./protocol";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const level = document.querySelector<HTMLSelectElement>("#retention")!;
const controls = [
  ...document.querySelectorAll<HTMLButtonElement>(".actions button"),
];
let currentTab: chrome.tabs.Tab | undefined;
let config: ExtensionConfig;
function show(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
const initialized = Promise.all([
  chrome.tabs.query({ active: true, currentWindow: true }),
  sendMessage<ExtensionConfig>({ type: "ww:config:get" }),
]).then(([tabs, settings]) => {
  currentTab = tabs[0];
  config = settings;
  level.value = config.retention;
  document.querySelector("#page-title")!.textContent =
    currentTab?.title || "当前网页";
  document.querySelector("#mode-badge")!.textContent =
    config.translationMode === "ai" ? "AI 翻译" : "免费翻译";
  document.querySelector("#privacy")!.textContent =
    config.translationMode === "ai"
      ? "点击翻译才会发送正文给你的 AI 服务，按服务商价格计费。"
      : "点击翻译才会发送正文给免费翻译服务。";
});
void initialized.catch((error: unknown) =>
  show(
    error instanceof Error ? error.message : "无法读取设置，请重新打开。",
    true,
  ),
);
async function invoke(message: ContentMessage) {
  controls.forEach((button) => {
    button.disabled = true;
  });
  try {
    await initialized;
    if (!currentTab?.id || !/^https?:\/\//.test(currentTab.url ?? ""))
      throw new Error(
        "请先打开一篇英文网页，再点小精灵。浏览器设置页和 PDF 暂不支持。",
      );
    if (message.type === "ww:open") {
      if (config.translationMode === "ai" && !config.aiApiKey)
        throw new Error(
          "AI 模式需要自己的 Key。打开设置填写，或切回免费翻译。",
        );
      await sendMessage({
        type: "ww:preferences:set",
        retention: level.value as Retention,
      });
    }
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ["content.js"],
    });
    const response = await chrome.tabs.sendMessage(currentTab.id, message);
    if (response?.ok === false)
      throw new Error(response.error || "无法打开网页学习工具。");
    window.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法打开插件。";
    show(
      /Cannot access|Missing host|extensions gallery|Receiving end/.test(
        message,
      )
        ? "这个网页不允许插件访问。请换一篇英文文章，或刷新后再试。"
        : message,
      true,
    );
  } finally {
    controls.forEach((button) => {
      button.disabled = false;
    });
  }
}
document.querySelector("#convert-article")!.addEventListener("click", () => {
  void invoke({ type: "ww:open", scope: "article" });
});
document.querySelector("#convert-selection")!.addEventListener("click", () => {
  void invoke({ type: "ww:open", scope: "selection" });
});
document.querySelector("#restore")!.addEventListener("click", () => {
  void invoke({ type: "ww:restore" });
});
document.querySelector("#settings")!.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
document.querySelector("#library")!.addEventListener("click", () => {
  void sendMessage({ type: "ww:library:open" }).catch((error: unknown) =>
    show(error instanceof Error ? error.message : "无法打开收藏。", true),
  );
});
