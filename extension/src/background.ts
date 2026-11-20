import {
  DEFAULT_CONFIG,
  normalizeAIBaseUrl,
  aiPermissionPattern,
  type ArticleInput,
  type ExtensionConfig,
  type ExtensionMessage,
  type ExtensionResponse,
  type JobRecord,
  type Retention,
  type TranslationMode,
} from "./protocol";
import { translateArticle, discoverModels } from "./translation";
import { inferAIProvider, isAIProvider, validateProvider } from "./providers";

const CONFIG_KEY = "wordweave.config";
const CREDENTIAL_KEY = "wordweave.ai.session";
// The old article library is left untouched; translations use a separate evictable cache.
const CACHE_KEY = "wordweave.translation.cache";
const MAX_ENTRIES = 20;
const MAX_BYTES = 3 * 1024 * 1024;
const workerId = crypto.randomUUID();
type LocalJob = JobRecord & {
  input: ArticleInput;
  retention: Retention;
  translationMode: TranslationMode;
  fingerprint: string;
  providerSignature: string;
  touched: number;
  workerId: string;
  runToken: string | null;
};
type TranslationCache = { version: 1; jobs: LocalJob[] };
type ObjectValue = Record<string, unknown>;
class RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
]);
const running = new Map<string, Promise<void>>();
const activeJobs = new Map<string, LocalJob>();
const liveResults = new Map<
  string,
  Pick<JobRecord, "article" | "progress" | "revision">
>();
const persistenceFailures = new Map<string, string>();
let storageQueue: Promise<unknown> = Promise.resolve();
let initialization: Promise<void> | undefined;
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(action, action);
  storageQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
function record(value: unknown): value is ObjectValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function retention(value: unknown): value is Retention {
  return value === "low" || value === "medium" || value === "high";
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(value))
    throw new RequestError("记录编号无效。", 400);
}
function normalizedConfig(saved: unknown): ExtensionConfig {
  const source = record(saved) ? saved : {};
  return {
    ...DEFAULT_CONFIG,
    // An older website-backed installation never opts a person into paid AI.
    translationMode: source.translationMode === "ai" ? "ai" : "free",
    aiProvider: isAIProvider(source.aiProvider)
      ? source.aiProvider
      : inferAIProvider(
          typeof source.aiBaseUrl === "string" ? source.aiBaseUrl : "",
        ),
    aiBaseUrl:
      typeof source.aiBaseUrl === "string"
        ? source.aiBaseUrl
        : DEFAULT_CONFIG.aiBaseUrl,
    aiApiKey: typeof source.aiApiKey === "string" ? source.aiApiKey : "",
    aiModel: typeof source.aiModel === "string" ? source.aiModel : "",
    serverUrl:
      typeof source.serverUrl === "string"
        ? source.serverUrl
        : DEFAULT_CONFIG.serverUrl,
    accessToken:
      typeof source.accessToken === "string" ? source.accessToken : "",
    retention: retention(source.retention) ? source.retention : "medium",
    glossMode:
      source.glossMode === "all" || source.glossMode === "click"
        ? source.glossMode
        : "first",
  };
}
async function config(): Promise<ExtensionConfig> {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(CONFIG_KEY),
    chrome.storage.session.get(CREDENTIAL_KEY),
  ]);
  const value = normalizedConfig(local[CONFIG_KEY]);
  const secret = session[CREDENTIAL_KEY];
  value.aiApiKey =
    record(secret) &&
    secret.aiProvider === value.aiProvider &&
    secret.aiBaseUrl === value.aiBaseUrl &&
    typeof secret.aiApiKey === "string"
      ? secret.aiApiKey
      : "";
  value.accessToken = "";
  return value;
}
async function saveConfig(value: ExtensionConfig) {
  // Persistent preferences never contain credentials, including the obsolete website token.
  await chrome.storage.local.set({
    [CONFIG_KEY]: { ...value, aiApiKey: "", accessToken: "" },
  });
  if (value.aiApiKey)
    await chrome.storage.session.set({
      [CREDENTIAL_KEY]: {
        aiProvider: value.aiProvider,
        aiBaseUrl: value.aiBaseUrl,
        aiApiKey: value.aiApiKey,
      },
    });
  else await chrome.storage.session.remove(CREDENTIAL_KEY);
}
async function cache(): Promise<TranslationCache> {
  const saved = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
  if (!record(saved) || saved.version !== 1 || !Array.isArray(saved.jobs))
    return { version: 1, jobs: [] };
  return saved as unknown as TranslationCache;
}
async function persist(value: TranslationCache, keepId?: string) {
  while (
    value.jobs.length > MAX_ENTRIES ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES
  ) {
    const candidate = value.jobs
      .filter((job) => job.status !== "running" && job.id !== keepId)
      .sort((a, b) => a.touched - b.touched)[0];
    if (!candidate)
      throw new RequestError("当前翻译占用的缓存过大，请选取较短正文。", 413);
    value.jobs = value.jobs.filter((job) => job.id !== candidate.id);
    liveResults.delete(candidate.id);
    persistenceFailures.delete(candidate.id);
  }
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: value });
  } catch {
    throw new RequestError(
      "浏览器存储空间不足或写入失败。请在设置中清除翻译缓存后重试。",
      507,
    );
  }
}
async function initialize() {
  initialization ??= (async () => {
    await storageReady;
    const previous = normalizedConfig(
      (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY],
    );
    // One-time migration: retain the old key for this browser session, erase its disk copy.
    // Fail closed if either storage operation fails; never quietly retain a permanent key.
    if (previous.aiApiKey || previous.accessToken) {
      if (previous.aiApiKey)
        await chrome.storage.session.set({
          [CREDENTIAL_KEY]: {
            aiProvider: previous.aiProvider,
            aiBaseUrl: previous.aiBaseUrl,
            aiApiKey: previous.aiApiKey,
          },
        });
      await chrome.storage.local.set({
        [CONFIG_KEY]: {
          ...previous,
          aiApiKey: "",
          accessToken: "",
        },
      });
    }
    const data = await cache();
    let changed = false;
    for (const job of data.jobs) {
      if (
        ["pending", "running"].includes(job.status) &&
        job.workerId !== workerId
      ) {
        job.status = "failed";
        job.runToken = null;
        job.error =
          "插件后台已重启，未完成的翻译已停止。已有学习版已保留；请主动重试，AI 重试可能再次计费。";
        changed = true;
      }
    }
    if (changed) {
      try {
        await persist(data);
      } catch {
        for (const job of data.jobs)
          if (job.status === "failed" && job.workerId !== workerId)
            persistenceFailures.set(
              job.id,
              job.error ?? "插件后台已重启，请清理存储空间后主动重试。",
            );
      }
    }
  })();
  return initialization;
}
async function aiConfigured(value: ExtensionConfig) {
  const baseUrl = normalizeAIBaseUrl(value.aiBaseUrl);
  const provider = validateProvider(
    value.aiProvider ?? inferAIProvider(baseUrl),
    baseUrl,
  );
  if (
    !value.aiApiKey.trim() ||
    value.aiApiKey.length > 2048 ||
    /\s/.test(value.aiApiKey)
  )
    throw new RequestError("请在插件设置中填写你自己的 AI API Key。", 400);
  if (
    !(await chrome.permissions.contains({
      origins: [aiPermissionPattern(baseUrl)],
    }))
  )
    throw new RequestError(
      "尚未授权访问此 AI 服务，请在插件设置中保存并授权。",
      403,
    );
  return {
    provider,
    baseUrl,
    apiKey: value.aiApiKey,
    model: value.aiModel.trim(),
  };
}
async function translationConfig(value: ExtensionConfig) {
  if (value.translationMode === "ai") await aiConfigured(value);
  return value;
}
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function providerSignature(value: ExtensionConfig) {
  return value.translationMode === "free"
    ? "google-free-v2-local-glossary"
    : digest(
        JSON.stringify({
          provider: `native-providers-v3:${value.aiProvider}`,
          baseUrl: normalizeAIBaseUrl(value.aiBaseUrl),
          model: value.aiModel.trim(),
          keyHash: await digest(value.aiApiKey),
        }),
      );
}
function pageUrl(sender: chrome.runtime.MessageSender) {
  const url = new URL(sender.url ?? sender.tab?.url ?? "");
  url.hash = "";
  return url.href;
}
function sourceUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}
function validateInput(
  value: unknown,
  sender: chrome.runtime.MessageSender,
): ArticleInput {
  if (
    !record(value) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 120 ||
    typeof value.sourceUrl !== "string" ||
    !Array.isArray(value.blocks) ||
    value.blocks.length < 1 ||
    value.blocks.length > 80
  )
    throw new RequestError(
      "文章参数无效：最多 80 段、20,000 个字符，标题最多 120 个字符。",
      400,
    );
  let source: URL;
  try {
    source = new URL(value.sourceUrl);
  } catch {
    throw new RequestError("无法确定文章所在网页，请刷新网页后重试。", 400);
  }
  if (
    !/^https?:$/.test(source.protocol) ||
    sourceUrl(source.href) !== pageUrl(sender) ||
    source.username ||
    source.password
  )
    throw new RequestError("文章来源必须是当前网页。", 400);
  const seen = new Set<string>();
  let length = 0;
  for (const block of value.blocks) {
    if (
      !record(block) ||
      typeof block.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,50}$/.test(block.id) ||
      seen.has(block.id) ||
      typeof block.markdown !== "string" ||
      !block.markdown.trim()
    )
      throw new RequestError("文章段落无效，请重新选择正文。", 400);
    seen.add(block.id);
    length += block.markdown.length;
  }
  if (length > 20_000)
    throw new RequestError(
      "正文超过 20,000 个字符，请选中较短的一节再转换。",
      400,
    );
  return {
    title: value.title.trim(),
    sourceUrl: sourceUrl(source.href),
    blocks: value.blocks as ArticleInput["blocks"],
  };
}
function publicJob(job: LocalJob, afterRevision?: number): JobRecord {
  const persistenceError = persistenceFailures.get(job.id);
  const live = liveResults.get(job.id);
  const article = live?.article ?? job.article;
  const revision = live?.revision ?? job.revision ?? 0;
  return {
    id: job.id,
    status: persistenceError ? "failed" : job.status,
    translationMode: job.translationMode,
    revision,
    ...(persistenceError || job.error
      ? { error: persistenceError ?? job.error }
      : {}),
    ...((live?.progress ?? job.progress)
      ? { progress: live?.progress ?? job.progress }
      : {}),
    ...(article && revision !== afterRevision ? { article } : {}),
  };
}
function assertJobPage(
  job: LocalJob,
  sender: chrome.runtime.MessageSender,
  trusted: boolean,
) {
  if (!trusted && sourceUrl(job.input.sourceUrl) !== pageUrl(sender))
    throw new RequestError("不能从其他网页读取这次翻译。", 403);
}
function findJob(data: TranslationCache, id: string) {
  const job = data.jobs.find((item) => item.id === id);
  if (!job)
    throw new RequestError("翻译缓存已过期，请在当前网页重新翻译。", 404);
  return job;
}
function safeError(error: unknown, value: ExtensionConfig) {
  let message =
    error instanceof Error ? error.message : "翻译未完成，请稍后重试。";
  for (const secret of [value.aiApiKey, value.accessToken])
    if (secret) message = message.split(secret).join("[已隐藏]");
  return message.slice(0, 400);
}
async function execute(job: LocalJob, value: ExtensionConfig) {
  const runToken = job.runToken;
  try {
    const article = await translateArticle(job.input, {
      id: job.id,
      mode: job.translationMode,
      retention: job.retention,
      ...(job.translationMode === "ai"
        ? { ai: await aiConfigured(value) }
        : {}),
      onProgress: (progress) => {
        liveResults.set(job.id, { ...liveResults.get(job.id), progress });
      },
      onPartial: (article) => {
        const previous = liveResults.get(job.id);
        liveResults.set(job.id, {
          ...previous,
          article,
          revision: (previous?.revision ?? job.revision ?? 0) + 1,
        });
      },
    });
    if (
      article.id !== job.id ||
      !article.version ||
      !Array.isArray(article.version.occurrences)
    )
      throw new RequestError("翻译返回的数据不完整，请重新尝试。");
    await serial(async () => {
      const data = await cache();
      const current = data.jobs.find(
        (item) =>
          item.id === job.id &&
          item.runToken === runToken &&
          item.status === "running",
      );
      if (!current) return;
      current.article = article;
      current.revision =
        (liveResults.get(job.id)?.revision ?? current.revision ?? 0) + 1;
      current.progress = liveResults.get(job.id)?.progress;
      current.status = "succeeded";
      current.error = undefined;
      current.runToken = null;
      current.touched = Date.now();
      await persist(data, job.id);
      liveResults.delete(job.id);
    });
  } catch (error) {
    try {
      await serial(async () => {
        const data = await cache();
        const current = data.jobs.find(
          (item) => item.id === job.id && item.runToken === runToken,
        );
        if (!current) return;
        current.status = "failed";
        current.runToken = null;
        current.error = safeError(error, value);
        await persist(data);
      });
    } catch {
      // The failure must be visible now even if the disk refuses its status
      // update. A restart also recovers the persisted lease as failed.
      persistenceFailures.set(
        job.id,
        "无法保存翻译缓存：请在设置中清除缓存后主动重试。",
      );
    }
  }
}
function launch(job: LocalJob, value: ExtensionConfig) {
  activeJobs.set(job.id, job);
  const work = execute(job, value);
  running.set(job.id, work);
  void work.finally(() => {
    running.delete(job.id);
    activeJobs.delete(job.id);
  });
}
async function startJob(
  value: ExtensionConfig,
  input: ArticleInput,
  level: Retention,
) {
  const signature = await providerSignature(value);
  const fingerprint = await digest(
    JSON.stringify({
      signature,
      sourceUrl: input.sourceUrl,
      title: input.title,
      blocks: input.blocks,
      retention: level,
    }),
  );
  let toLaunch: LocalJob | undefined;
  const response = await serial(async () => {
    const data = await cache();
    const existing = data.jobs.find(
      (entry) => entry.fingerprint === fingerprint,
    );
    if (existing)
      return {
        id: existing.id,
        status: persistenceFailures.has(existing.id)
          ? "failed"
          : existing.status,
      };
    if (
      data.jobs.filter(
        (entry) =>
          entry.status === "running" && !persistenceFailures.has(entry.id),
      ).length >= 2
    )
      throw new RequestError("已有两篇文章正在翻译，请等待完成后再试。", 429);
    const job: LocalJob = {
      id: `local_${crypto.randomUUID()}`,
      status: "running",
      input,
      retention: level,
      translationMode: value.translationMode,
      providerSignature: signature,
      fingerprint,
      touched: Date.now(),
      workerId,
      runToken: crypto.randomUUID(),
      revision: 0,
      progress: {
        stage: "preparing",
        completed: 0,
        total: input.blocks.length,
      },
    };
    data.jobs.unshift(job);
    await persist(data); // Save the attempt before any billable network call.
    toLaunch = job;
    return { id: job.id, status: job.status };
  });
  if (toLaunch) launch(toLaunch, value);
  return response;
}
function uiSender(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.url) return false;
  try {
    const url = new URL(sender.url);
    return ["popup.html", "options.html"].some(
      (file) =>
        `${url.protocol}//${url.host}${url.pathname}` ===
        chrome.runtime.getURL(file),
    );
  } catch {
    return false;
  }
}
function pageSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.tab?.id !== undefined &&
    /^https?:\/\//.test(sender.url ?? "") &&
    (sender.frameId ?? 0) === 0
  );
}
async function handle(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (
    sender.id !== chrome.runtime.id ||
    !record(message) ||
    typeof message.type !== "string"
  )
    throw new RequestError("此消息来源不受信任。", 403);
  const trusted = uiSender(sender);
  const page = pageSender(sender);
  if (!trusted && !page) throw new RequestError("此消息来源不受信任。", 403);
  if (
    [
      "ww:config:get",
      "ww:config:set",
      "ww:status",
      "ww:models:list",
      "ww:cache:clear",
    ].includes(message.type) &&
    !trusted
  )
    throw new RequestError("此操作仅允许在插件页面中执行。", 403);
  await initialize();
  const msg = message as ExtensionMessage;
  switch (msg.type) {
    case "ww:config:get":
      return config();
    case "ww:config:set": {
      if (
        !record(msg.config) ||
        !["free", "ai"].includes(msg.config.translationMode) ||
        !retention(msg.config.retention) ||
        !["all", "first", "click"].includes(msg.config.glossMode) ||
        typeof msg.config.aiBaseUrl !== "string" ||
        msg.config.aiBaseUrl.length > 2048 ||
        typeof msg.config.aiApiKey !== "string" ||
        msg.config.aiApiKey.length > 2048 ||
        typeof msg.config.aiModel !== "string" ||
        msg.config.aiModel.length > 200 ||
        (msg.config.aiProvider !== undefined &&
          msg.config.aiProvider !== "" &&
          !isAIProvider(msg.config.aiProvider))
      )
        throw new RequestError("插件设置无效。", 400);
      const next = normalizedConfig(msg.config);
      next.aiApiKey = next.aiApiKey.trim();
      next.aiModel = next.aiModel.trim();
      if (next.translationMode === "ai") {
        next.aiBaseUrl = normalizeAIBaseUrl(next.aiBaseUrl);
        const previous = await config();
        if (
          previous.aiApiKey &&
          previous.aiApiKey === next.aiApiKey &&
          (previous.aiProvider !== next.aiProvider ||
            new URL(previous.aiBaseUrl).origin !==
              new URL(next.aiBaseUrl).origin)
        )
          throw new RequestError(
            "更换服务商后，请填写对应的新 Key，不能沿用其他服务的 Key。",
            400,
          );
        await aiConfigured(next);
      }
      await serial(() => saveConfig(next));
      return null;
    }
    case "ww:preferences:get": {
      const value = await config();
      return {
        retention: value.retention,
        glossMode: value.glossMode,
        translationMode: value.translationMode,
        localOnly: true,
      };
    }
    case "ww:preferences:set": {
      if (
        (msg.retention !== undefined && !retention(msg.retention)) ||
        (msg.glossMode !== undefined &&
          !["all", "first", "click"].includes(msg.glossMode))
      )
        throw new RequestError("阅读偏好无效。", 400);
      return serial(async () => {
        const value = await config();
        if (msg.retention !== undefined) value.retention = msg.retention;
        if (msg.glossMode !== undefined) value.glossMode = msg.glossMode;
        await saveConfig(value);
        return {
          retention: value.retention,
          glossMode: value.glossMode,
          translationMode: value.translationMode,
          localOnly: true,
        };
      });
    }
    case "ww:status": {
      const value = await config();
      if (value.translationMode === "ai") await aiConfigured(value);
      return {
        ok: true,
        modelConfigured: value.translationMode === "free" || !!value.aiApiKey,
        translationMode: value.translationMode,
        localOnly: true,
      };
    }
    case "ww:models:list": {
      const connection = await aiConfigured(await config());
      return { models: await discoverModels(connection) };
    }
    case "ww:cache:clear":
      if (running.size)
        throw new RequestError("正在翻译，请完成后再清除缓存。");
      await serial(async () => {
        await persist({ version: 1, jobs: [] });
        liveResults.clear();
        persistenceFailures.clear();
      });
      return null;
    case "ww:job:start": {
      if (!page) throw new RequestError("请从文章网页启动转换。", 403);
      if (!retention(msg.retention))
        throw new RequestError("英文保留量无效。", 400);
      const value = await config();
      if ((msg.translationMode ?? "free") !== value.translationMode)
        throw new RequestError("翻译方式已改变，请重新打开插件后确认。", 409);
      return startJob(
        await translationConfig(value),
        validateInput(msg.input, sender),
        msg.retention,
      );
    }
    case "ww:job:get": {
      identifier(msg.id);
      const job = activeJobs.get(msg.id) ?? findJob(await cache(), msg.id);
      assertJobPage(job, sender, trusted);
      if (
        msg.afterRevision !== undefined &&
        (!Number.isSafeInteger(msg.afterRevision) || msg.afterRevision < 0)
      )
        throw new RequestError("翻译进度编号无效。", 400);
      return publicJob(job, msg.afterRevision);
    }
    case "ww:job:retry": {
      identifier(msg.id);
      const value = await translationConfig(await config());
      const signature = await providerSignature(value);
      let toLaunch: LocalJob | undefined;
      const result = await serial(async () => {
        const data = await cache();
        const job = findJob(data, msg.id);
        assertJobPage(job, sender, trusted);
        if (
          job.providerSignature !== signature ||
          job.translationMode !== value.translationMode
        )
          throw new RequestError(
            "翻译方式或 AI 配置已改变，请回到原网页重新打开插件并转换。",
            409,
          );
        if (job.status !== "failed" && !persistenceFailures.has(job.id))
          return { id: job.id, status: job.status };
        if (
          data.jobs.filter(
            (item) =>
              item.status === "running" && !persistenceFailures.has(item.id),
          ).length >= 2
        )
          throw new RequestError("已有两篇文章正在翻译，请稍后重试。", 429);
        liveResults.delete(job.id);
        job.article = undefined;
        job.revision = (job.revision ?? 0) + 1;
        job.status = "running";
        job.error = undefined;
        job.workerId = workerId;
        job.runToken = crypto.randomUUID();
        job.touched = Date.now();
        await persist(data);
        persistenceFailures.delete(job.id);
        toLaunch = job;
        return { id: job.id, status: job.status };
      });
      if (toLaunch) launch(toLaunch, value);
      return result;
    }
    default:
      throw new RequestError("不支持的插件操作。", 400);
  }
}
chrome.runtime.onMessage.addListener(
  (message: unknown, sender, respond: (value: ExtensionResponse) => void) => {
    handle(message, sender).then(
      (data) => respond({ ok: true, data }),
      (error: unknown) =>
        respond({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "插件操作失败，请稍后重试。",
          ...(error instanceof RequestError && error.status
            ? { status: error.status }
            : {}),
        }),
    );
    return true;
  },
);
