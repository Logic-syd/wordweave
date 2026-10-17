import { normalizeServerUrl, permissionPattern, sendMessage, type ExtensionConfig, type GlossMode, type Retention } from "./protocol";

const server = document.querySelector<HTMLInputElement>("#server-url")!;
const token = document.querySelector<HTMLInputElement>("#access-token")!;
const level = document.querySelector<HTMLSelectElement>("#retention")!;
const gloss = document.querySelector<HTMLSelectElement>("#gloss-mode")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("#config-form")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const test = document.querySelector<HTMLButtonElement>("#test")!;
let savedConfig: ExtensionConfig | undefined;
function show(message: string, error = false) { status.textContent = message; status.classList.toggle("error", error); }
function values(): ExtensionConfig {
  return { serverUrl: normalizeServerUrl(server.value), accessToken: token.value.trim(), retention: level.value as Retention, glossMode: gloss.value as GlossMode };
}
void sendMessage<ExtensionConfig>({ type: "ww:config:get" }).then((config) => {
  savedConfig = config;
  server.value = config.serverUrl;
  token.value = config.accessToken;
  level.value = config.retention;
  gloss.value = config.glossMode;
}).catch((error: unknown) => show(error instanceof Error ? error.message : "无法读取设置。", true));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  let next: ExtensionConfig;
  try { next = values(); } catch (error) { show(error instanceof Error ? error.message : "网站地址无效。", true); return; }
  if (next.accessToken.length < 32 || next.accessToken.length > 512 || /\s/.test(next.accessToken)) {
    show("访问令牌需为 32–512 个非空白字符。", true); return;
  }
  save.disabled = true;
  // Call directly inside the click/submit gesture, before any asynchronous work.
  void chrome.permissions.request({ origins: [permissionPattern(next.serverUrl)] }).then(async (granted) => {
    if (!granted) throw new Error("尚未授权连接服务器，设置未保存。可以重新点击保存。");
    await sendMessage({ type: "ww:config:set", config: next });
    savedConfig = next;
    server.value = next.serverUrl;
    show("设置已保存。点击「测试连接」确认后，就可以打开文章开始阅读。");
  }).catch((error: unknown) => show(error instanceof Error ? error.message : "设置保存失败。", true))
    .finally(() => { save.disabled = false; });
});
test.addEventListener("click", () => {
  let current: ExtensionConfig;
  try { current = values(); } catch (error) { show(error instanceof Error ? error.message : "请先保存设置。", true); return; }
  if (JSON.stringify(current) !== JSON.stringify(savedConfig)) { show("设置有修改，请先保存再测试连接。", true); return; }
  test.disabled = true;
  show("正在连接你的语境网站…");
  void sendMessage<{ ok: true; modelConfigured: boolean }>({ type: "ww:status" }).then((result) => {
    show(result.modelConfigured ? "连接成功，模型服务已配置。打开英文文章就能开始转换。" : "网站连接成功。网站尚未配置模型 API，配置后才能生成学习版。", !result.modelConfigured);
  }).catch((error: unknown) => show(error instanceof Error ? error.message : "连接失败。", true))
    .finally(() => { test.disabled = false; });
});
document.querySelector<HTMLButtonElement>("#clear-cache")!.addEventListener("click", () => {
  void sendMessage({ type: "ww:cache:clear" }).then(() => show("任务缓存已清除。网站中的文章和收藏仍保留。"))
    .catch((error: unknown) => show(error instanceof Error ? error.message : "清除失败。", true));
});
