import {
  DEFAULT_CONFIG,
  normalizeServerUrl,
  permissionPattern,
  type ArticleInput,
  type ExtensionConfig,
  type ExtensionMessage,
  type ExtensionResponse,
  type JobRecord,
  type Retention,
  type WordPatch,
} from "./protocol";

const CONFIG_KEY = "wordweave.config";
const CACHE_KEY = "wordweave.jobs";
type CacheEntry = { fingerprint: string; requestKey: string; id?: string; touched: number };
type RecordValue = Record<string, unknown>;
class RequestError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

// Content scripts must never be able to read the credential, even on the first run.
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
const inFlight = new Map<string, Promise<Pick<JobRecord, "id" | "status">>>();
let storageQueue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
}
function record(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function retention(value: unknown): value is Retention {
  return value === "low" || value === "medium" || value === "high";
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(value)) {
    throw new RequestError("记录编号无效。", 400);
  }
}
async function config(): Promise<ExtensionConfig> {
  await storageReady;
  const saved = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
  return { ...DEFAULT_CONFIG, ...(record(saved) ? saved : {}) } as ExtensionConfig;
}
async function configured(): Promise<ExtensionConfig> {
  const value = await config();
  value.serverUrl = normalizeServerUrl(value.serverUrl);
  if (value.accessToken.length < 32) {
    throw new RequestError("请先打开插件设置，填写网站的插件访问令牌（至少 32 个字符）。");
  }
  const granted = await chrome.permissions.contains({ origins: [permissionPattern(value.serverUrl)] });
  if (!granted) throw new RequestError("尚未授权访问此服务器，请打开设置重新保存并授权。");
  return value;
}

async function request<T>(value: ExtensionConfig, path: string, method = "GET", body?: unknown): Promise<T> {
  // path is created only by the fixed handlers below, never from a webpage URL.
  if (!/^\/api\/extension\/(?:status|articles(?:\/[a-zA-Z0-9_-]+(?:\/retry)?)?|vocabulary\/[a-zA-Z0-9_-]+)$/.test(path)) {
    throw new RequestError("插件接口地址无效。");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${value.serverUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${value.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > 4_000_000) throw new RequestError("服务器返回的内容过大，请减少文章长度。");
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new RequestError("服务器未返回有效数据，请确认网站地址与部署状态。", response.status); }
    if (!response.ok || (record(data) && data.ok === false)) {
      const error = record(data) && typeof data.error === "string" ? data.error :
        response.status === 401 ? "插件访问令牌不正确，请检查插件设置和网站环境变量。" :
        response.status === 429 ? "正在处理的文章较多，请稍后重试。" : "请求失败，请稍后重试或检查网站部署。";
      throw new RequestError(error.slice(0, 400), response.status);
    }
    return (record(data) && data.ok === true && "data" in data ? data.data : data) as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(controller.signal.aborted
      ? "连接超时。可以重试；相同内容会复用任务，避免重复生成。"
      : "无法连接服务器，请检查网络、网站地址和访问权限。");
  } finally { clearTimeout(timeout); }
}

function validateInput(value: unknown, sender: chrome.runtime.MessageSender): ArticleInput {
  if (!record(value) || typeof value.title !== "string" || !value.title.trim() || value.title.length > 120 ||
      typeof value.sourceUrl !== "string" || !Array.isArray(value.blocks) || value.blocks.length < 1 || value.blocks.length > 80) {
    throw new RequestError("文章参数无效：最多 80 段、20,000 个字符，标题最多 120 个字符。", 400);
  }
  let source: URL;
  let page: URL;
  try { source = new URL(value.sourceUrl); page = new URL(sender.tab?.url ?? sender.url ?? ""); }
  catch { throw new RequestError("无法确定文章所在网页，请刷新网页后重试。", 400); }
  if (!/^https?:$/.test(source.protocol) || source.origin !== page.origin || source.username || source.password) {
    throw new RequestError("文章来源必须来自当前网页。", 400);
  }
  const seen = new Set<string>();
  let length = 0;
  for (const block of value.blocks) {
    if (!record(block) || typeof block.id !== "string" || !/^[a-zA-Z0-9_-]{1,50}$/.test(block.id) ||
        seen.has(block.id) || typeof block.markdown !== "string" || !block.markdown.trim()) {
      throw new RequestError("文章段落无效，请重新选择正文。", 400);
    }
    seen.add(block.id);
    length += block.markdown.length;
  }
  if (length > 20_000) throw new RequestError("正文超过 20,000 个字符，请选中较短的一节再转换。", 400);
  return { title: value.title, sourceUrl: source.href, blocks: value.blocks as ArticleInput["blocks"] };
}
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function cacheEntry(fingerprint: string): Promise<CacheEntry> {
  return serial(async () => {
    const data = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
    const entries: CacheEntry[] = Array.isArray(data) ? data : [];
    const existing = entries.find((entry) => entry.fingerprint === fingerprint);
    const entry = { ...(existing ?? { fingerprint, requestKey: crypto.randomUUID() }), touched: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: [entry, ...entries.filter((item) => item.fingerprint !== fingerprint)].slice(0, 100) });
    return entry;
  });
}
async function remember(entry: CacheEntry, id: string): Promise<void> {
  await serial(async () => {
    const data = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
    const entries: CacheEntry[] = Array.isArray(data) ? data : [];
    await chrome.storage.local.set({ [CACHE_KEY]: [{ ...entry, id, touched: Date.now() }, ...entries.filter((item) => item.fingerprint !== entry.fingerprint)].slice(0, 100) });
  });
}
async function startJob(value: ExtensionConfig, input: ArticleInput, level: Retention): Promise<Pick<JobRecord, "id" | "status">> {
  const tokenHash = await digest(value.accessToken);
  const fingerprint = await digest(JSON.stringify({ server: value.serverUrl, tokenHash, sourceUrl: input.sourceUrl, blocks: input.blocks, retention: level }));
  const existing = inFlight.get(fingerprint);
  if (existing) return existing;
  const work = (async () => {
    // Save the idempotency key before sending: a network error or worker restart can safely retry.
    const entry = await cacheEntry(fingerprint);
    if (entry.id) {
      try {
        const job = await request<JobRecord>(value, `/api/extension/articles/${entry.id}`);
        return { id: job.id, status: job.status };
      } catch (error) {
        if (!(error instanceof RequestError) || error.status !== 404) throw error;
        throw new RequestError("此文章已在网站中删除。请在插件设置中清除任务缓存后重新转换。", 404);
      }
    }
    const job = await request<Pick<JobRecord, "id" | "status">>(value, "/api/extension/articles", "POST", { ...input, retention: level, requestKey: entry.requestKey });
    identifier(job.id);
    await remember(entry, job.id);
    return job;
  })();
  inFlight.set(fingerprint, work);
  try { return await work; } finally { inFlight.delete(fingerprint); }
}

function uiSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.url === chrome.runtime.getURL("popup.html") || sender.url === chrome.runtime.getURL("options.html");
}
function pageSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.tab?.id !== undefined && /^https?:\/\//.test(sender.url ?? "") && (sender.frameId ?? 0) === 0;
}
async function handle(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await storageReady;
  if (sender.id !== chrome.runtime.id || !record(message) || typeof message.type !== "string") {
    throw new RequestError("此消息来源不受信任。", 403);
  }
  const trusted = uiSender(sender);
  const page = pageSender(sender);
  if (!trusted && !page) throw new RequestError("此消息来源不受信任。", 403);
  if (["ww:config:get", "ww:config:set", "ww:status", "ww:cache:clear"].includes(message.type) && !trusted) {
    throw new RequestError("此操作仅允许在插件设置中执行。", 403);
  }
  if (["ww:job:start", "ww:job:get", "ww:job:retry", "ww:word:update", "ww:reader:open"].includes(message.type) && !page) {
    throw new RequestError("请从文章网页使用学习和词卡功能。", 403);
  }
  const msg = message as ExtensionMessage;
  switch (msg.type) {
    case "ww:config:get": return config();
    case "ww:config:set": {
      if (!record(msg.config) || typeof msg.config.serverUrl !== "string" || typeof msg.config.accessToken !== "string" ||
          msg.config.accessToken.trim().length < 32 || msg.config.accessToken.length > 512 || /\s/.test(msg.config.accessToken.trim()) ||
          !retention(msg.config.retention) || !["all", "first", "click"].includes(msg.config.glossMode)) {
        throw new RequestError("设置无效；访问令牌需为 32–512 个非空白字符。", 400);
      }
      const next: ExtensionConfig = { serverUrl: normalizeServerUrl(msg.config.serverUrl), accessToken: msg.config.accessToken.trim(), retention: msg.config.retention, glossMode: msg.config.glossMode };
      if (!(await chrome.permissions.contains({ origins: [permissionPattern(next.serverUrl)] }))) throw new RequestError("请先授权插件连接此服务器。");
      const previous = await config();
      await serial(() => chrome.storage.local.set({ [CONFIG_KEY]: next }));
      if (permissionPattern(previous.serverUrl) !== permissionPattern(next.serverUrl)) {
        await chrome.permissions.remove({ origins: [permissionPattern(previous.serverUrl)] });
      }
      return null;
    }
    case "ww:preferences:get": {
      const value = await config();
      return { retention: value.retention, glossMode: value.glossMode };
    }
    case "ww:preferences:set": {
      if ((msg.retention !== undefined && !retention(msg.retention)) ||
          (msg.glossMode !== undefined && !["all", "first", "click"].includes(msg.glossMode))) {
        throw new RequestError("阅读偏好无效。", 400);
      }
      return serial(async () => {
        const value = await config();
        if (msg.retention !== undefined) value.retention = msg.retention;
        if (msg.glossMode !== undefined) value.glossMode = msg.glossMode;
        await chrome.storage.local.set({ [CONFIG_KEY]: value });
        return { retention: value.retention, glossMode: value.glossMode };
      });
    }
    case "ww:status": return request(await configured(), "/api/extension/status");
    case "ww:cache:clear":
      if (inFlight.size) throw new RequestError("文章正在提交，请稍后清除缓存。");
      await serial(() => chrome.storage.local.remove(CACHE_KEY));
      return null;
    case "ww:job:start": {
      if (!page) throw new RequestError("请从文章网页启动转换。", 403);
      if (!retention(msg.retention)) throw new RequestError("英文保留量无效。", 400);
      return startJob(await configured(), validateInput(msg.input, sender), msg.retention);
    }
    case "ww:job:get":
      identifier(msg.id);
      return request(await configured(), `/api/extension/articles/${msg.id}`);
    case "ww:job:retry":
      identifier(msg.id);
      return request(await configured(), `/api/extension/articles/${msg.id}/retry`, "POST");
    case "ww:word:update": {
      identifier(msg.id);
      if (!record(msg.patch) || !Object.keys(msg.patch).length || Object.keys(msg.patch).some((key) => !["status", "favorite", "category"].includes(key)) ||
          (msg.patch.status !== undefined && !["LEARNING", "KNOWN", "IGNORED"].includes(msg.patch.status)) ||
          (msg.patch.favorite !== undefined && typeof msg.patch.favorite !== "boolean") ||
          (msg.patch.category !== undefined && !["technical", "general"].includes(msg.patch.category))) {
        throw new RequestError("词卡操作无效。", 400);
      }
      return request(await configured(), `/api/extension/vocabulary/${msg.id}`, "PATCH", msg.patch as WordPatch);
    }
    case "ww:reader:open": {
      identifier(msg.id);
      const value = await configured();
      await chrome.tabs.create({ url: `${value.serverUrl}/read/${msg.id}` });
      return null;
    }
    default: throw new RequestError("不支持的插件操作。", 400);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond: (value: ExtensionResponse) => void) => {
  handle(message, sender).then(
    (data) => respond({ ok: true, data }),
    (error: unknown) => respond({ ok: false, error: error instanceof Error ? error.message : "插件操作失败，请稍后重试。", ...(error instanceof RequestError && error.status ? { status: error.status } : {}) }),
  );
  return true;
});
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
});
