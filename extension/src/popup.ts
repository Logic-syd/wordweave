import { sendMessage, type ContentMessage, type ExtensionConfig, type Retention } from "./protocol";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const level = document.querySelector<HTMLSelectElement>("#retention")!;
const controls = Array.from(document.querySelectorAll<HTMLButtonElement>(".actions button"));
let currentTab: chrome.tabs.Tab | undefined;
let hasConfig = false;
function show(message: string, error = false) { status.textContent = message; status.classList.toggle("error", error); }
async function initialize() {
  const [tabs, config] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    sendMessage<ExtensionConfig>({ type: "ww:config:get" }),
  ]);
  currentTab = tabs[0];
  level.value = config.retention;
  hasConfig = config.accessToken.length >= 32;
  document.querySelector("#page-title")!.textContent = currentTab?.title || "当前网页";
  if (!hasConfig) show("首次使用：请先打开插件设置连接你的语境网站。");
}
async function invoke(message: ContentMessage) {
  controls.forEach((button) => { button.disabled = true; });
  try {
    if (!currentTab?.id || !/^https?:\/\//.test(currentTab.url ?? "")) {
      throw new Error("请打开普通文章网页。浏览器设置页、扩展商店和本地文件无法转换。");
    }
    if (message.type === "ww:open") {
      if (!hasConfig) { await chrome.runtime.openOptionsPage(); return; }
      await sendMessage({ type: "ww:preferences:set", retention: level.value as Retention });
    }
    await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
    const response = await chrome.tabs.sendMessage(currentTab.id, message);
    if (response?.ok === false) throw new Error(response.error || "无法打开网页学习工具。");
    window.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法打开插件。";
    show(/Cannot access|Missing host|extensions gallery|Receiving end/.test(message)
      ? "此网页不允许插件访问，请换一个普通文章网页，或刷新后重试。" : message, true);
  } finally { controls.forEach((button) => { button.disabled = false; }); }
}
document.querySelector("#convert-article")!.addEventListener("click", () => { void invoke({ type: "ww:open", scope: "article" }); });
document.querySelector("#convert-selection")!.addEventListener("click", () => { void invoke({ type: "ww:open", scope: "selection" }); });
document.querySelector("#restore")!.addEventListener("click", () => { void invoke({ type: "ww:restore" }); });
document.querySelector("#settings")!.addEventListener("click", () => { void chrome.runtime.openOptionsPage(); });
void initialize().catch((error: unknown) => show(error instanceof Error ? error.message : "插件初始化失败，请重新打开。", true));
