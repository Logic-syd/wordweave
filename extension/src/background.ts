import {
  DEFAULT_CONFIG,
  normalizeAIBaseUrl,
  aiPermissionPattern,
  type ArticleDetail,
  type ArticleInput,
  type ExtensionConfig,
  type ExtensionMessage,
  type ExtensionResponse,
  type JobRecord,
  type LibrarySnapshot,
  type Retention,
  type TranslationMode,
  type UserWord,
  type WordPatch,
} from "./protocol";
import { translateArticle, discoverModels } from "./translation";
import type { VocabularyView, Word } from "../../src/lib/types";

const CONFIG_KEY = "wordweave.config";
const LIBRARY_KEY = "wordweave.local.library";
const MAX_ARTICLES = 20;
const MAX_BYTES = 5 * 1024 * 1024;
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
type LocalWord = { word: Word; touched: number };
type LocalLibrary = { version: 1; jobs: LocalJob[]; words: LocalWord[] };
type ObjectValue = Record<string, unknown>;
class RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
const storageReady = chrome.storage.local.setAccessLevel({
  accessLevel: "TRUSTED_CONTEXTS",
});
const running = new Map<string, Promise<void>>();
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
  return normalizedConfig(
    (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY],
  );
}
async function library(): Promise<LocalLibrary> {
  const saved = (await chrome.storage.local.get(LIBRARY_KEY))[LIBRARY_KEY];
  if (
    !record(saved) ||
    saved.version !== 1 ||
    !Array.isArray(saved.jobs) ||
    !Array.isArray(saved.words)
  )
    return { version: 1, jobs: [], words: [] };
  return saved as unknown as LocalLibrary;
}
async function persist(value: LocalLibrary) {
  if (value.jobs.length > MAX_ARTICLES)
    throw new RequestError(
      "本机文章库最多保存 20 篇，请先删除不需要的文章。",
      429,
    );
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES)
    throw new RequestError(
      "本机学习库已达到 5 MiB 上限，请先删除文章。已有文章和收藏保持不变。",
      413,
    );
  try {
    await chrome.storage.local.set({ [LIBRARY_KEY]: value });
  } catch {
    throw new RequestError(
      "浏览器存储空间不足或写入失败。已有数据保持不变，请清理空间后重试。",
      507,
    );
  }
}
async function initialize() {
  initialization ??= (async () => {
    await storageReady;
    const next = await config();
    // Migration is deliberately local; neither the old server nor its token is contacted.
    try {
      await chrome.storage.local.set({ [CONFIG_KEY]: next });
    } catch {
      /* Sanitized reads still default to free; allow opening the library to free space. */
    }
    const data = await library();
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
  return { baseUrl, apiKey: value.aiApiKey, model: value.aiModel.trim() };
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
    ? "google-free-v1"
    : digest(
        JSON.stringify({
          provider: "openai-compatible",
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
function freshUser(): UserWord {
  return {
    status: "NEW",
    favorite: false,
    category: null,
    exposureCount: 0,
    reviewCount: 0,
    knownStreak: 0,
    dueAt: null,
  };
}
function retained(word: Word) {
  return (
    word.user?.favorite ||
    word.user?.status === "LEARNING" ||
    word.user?.status === "KNOWN"
  );
}
function pruneWords(data: LocalLibrary) {
  const used = new Set(
    data.jobs.flatMap(
      (job) =>
        job.article?.version?.occurrences.map((item) => item.vocabularyId) ??
        [],
    ),
  );
  data.words = data.words.filter(
    ({ word }) => used.has(word.id) || retained(word),
  );
}
function articleWithWords(
  article: ArticleDetail,
  words: LocalWord[],
): ArticleDetail {
  if (!article.version) return article;
  const users = new Map(words.map(({ word }) => [word.id, word.user]));
  return {
    ...article,
    version: {
      ...article.version,
      occurrences: article.version.occurrences.map((occurrence) => ({
        ...occurrence,
        word: {
          ...occurrence.word,
          user: users.get(occurrence.vocabularyId) ?? occurrence.word.user,
        },
      })),
    },
  };
}
function publicJob(job: LocalJob, words: LocalWord[]): JobRecord {
  const persistenceError = persistenceFailures.get(job.id);
  return {
    id: job.id,
    status: persistenceError ? "failed" : job.status,
    title: job.input.title,
    sourceUrl: job.input.sourceUrl,
    translationMode: job.translationMode,
    ...(persistenceError || job.error
      ? { error: persistenceError ?? job.error }
      : {}),
    ...(job.progress ? { progress: job.progress } : {}),
    ...(job.article ? { article: articleWithWords(job.article, words) } : {}),
  };
}
function assertJobPage(
  job: LocalJob,
  sender: chrome.runtime.MessageSender,
  trusted: boolean,
) {
  if (!trusted && sourceUrl(job.input.sourceUrl) !== pageUrl(sender))
    throw new RequestError("不能从其他网页读取这篇本机文章。", 403);
}
function findJob(data: LocalLibrary, id: string) {
  const job = data.jobs.find((item) => item.id === id);
  if (!job)
    throw new RequestError(
      "本机文章不存在或已删除，请回到原网页重新转换。",
      404,
    );
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
  let lastProgressAt = 0;
  try {
    const article = await translateArticle(job.input, {
      id: job.id,
      mode: job.translationMode,
      retention: job.retention,
      ...(job.translationMode === "ai"
        ? { ai: await aiConfigured(value) }
        : {}),
      onProgress: (progress) => {
        const now = Date.now();
        if (
          lastProgressAt &&
          progress.completed !== progress.total &&
          now - lastProgressAt < 350
        )
          return;
        lastProgressAt = now;
        void serial(async () => {
          const data = await library();
          const current = data.jobs.find(
            (item) =>
              item.id === job.id &&
              item.runToken === runToken &&
              item.status === "running",
          );
          if (!current) return;
          current.progress = {
            stage: progress.stage.slice(0, 60),
            completed: Math.max(0, Math.floor(progress.completed)),
            total: Math.max(0, Math.floor(progress.total)),
          };
          await persist(data);
        }).catch(() => {
          /* Final save below reports any persistent storage failure. */
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
      const data = await library();
      const current = data.jobs.find(
        (item) =>
          item.id === job.id &&
          item.runToken === runToken &&
          item.status === "running",
      );
      if (!current) return;
      const seen = new Set<string>();
      for (const occurrence of article.version!.occurrences) {
        if (seen.has(occurrence.vocabularyId)) continue;
        seen.add(occurrence.vocabularyId);
        const existing = data.words.find(
          ({ word }) => word.id === occurrence.vocabularyId,
        );
        if (existing) {
          const user = existing.word.user ?? freshUser();
          existing.word.user = {
            ...user,
            exposureCount: user.exposureCount + 1,
          };
        } else {
          data.words.push({
            word: {
              ...occurrence.word,
              id: occurrence.vocabularyId,
              user: { ...freshUser(), exposureCount: 1 },
            },
            touched: Date.now(),
          });
        }
      }
      current.article = article;
      current.status = "succeeded";
      current.error = undefined;
      current.runToken = null;
      current.touched = Date.now();
      await persist(data);
    });
  } catch (error) {
    try {
      await serial(async () => {
        const data = await library();
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
        "翻译未能保存：浏览器存储空间不足或写入失败。请清理空间后主动重试，已有数据未覆盖。",
      );
    }
  }
}
function launch(job: LocalJob, value: ExtensionConfig) {
  const work = execute(job, value);
  running.set(job.id, work);
  void work.finally(() => running.delete(job.id));
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
    const data = await library();
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
    return ["popup.html", "options.html", "library.html"].some(
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
function patchUser(current: UserWord, patch: WordPatch): UserWord {
  const next = { ...current, ...patch };
  if (patch.favorite && current.status === "NEW" && !patch.status)
    next.status = "LEARNING";
  if (patch.status) {
    next.reviewCount += 1;
    next.knownStreak = patch.status === "KNOWN" ? current.knownStreak + 1 : 0;
  }
  if (next.status === "IGNORED") next.dueAt = null;
  else if (patch.status || (patch.favorite && current.status === "NEW"))
    next.dueAt = new Date(
      Date.now() +
        (next.status === "KNOWN"
          ? Math.min(30, 2 ** next.knownStreak) * 86400_000
          : 0),
    ).toISOString();
  return next;
}
function validatePatch(value: unknown): asserts value is WordPatch {
  if (
    !record(value) ||
    !Object.keys(value).length ||
    Object.keys(value).some(
      (key) => !["status", "favorite", "category"].includes(key),
    ) ||
    (value.status !== undefined &&
      !["LEARNING", "KNOWN", "IGNORED"].includes(value.status as string)) ||
    (value.favorite !== undefined && typeof value.favorite !== "boolean") ||
    (value.category !== undefined &&
      !["technical", "general"].includes(value.category as string))
  )
    throw new RequestError("词卡操作无效。", 400);
}
async function snapshot(): Promise<LibrarySnapshot> {
  const data = await library();
  const articles = data.jobs
    .filter((job) => job.article)
    .map((job) => articleWithWords(job.article!, data.words));
  const words: VocabularyView[] = data.words.map(({ word }) => ({
    ...word,
    appearances: articles.flatMap(
      (article) =>
        article.version?.occurrences
          .filter((occurrence) => occurrence.vocabularyId === word.id)
          .map((occurrence) => ({
            articleId: article.id,
            title: article.title,
            sentence: occurrence.sentence,
            form: occurrence.form,
            sourceId: occurrence.sourceId,
          })) ?? [],
    ),
  }));
  return {
    articles,
    words,
    jobs: data.jobs.map((job) => {
      const summary = publicJob(job, data.words);
      delete summary.article;
      return summary;
    }),
    localOnly: true,
  };
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
      "ww:library:get",
      "ww:library:delete",
      "ww:library:open",
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
        msg.config.aiModel.length > 200
      )
        throw new RequestError("插件设置无效。", 400);
      const next = normalizedConfig(msg.config);
      next.aiApiKey = next.aiApiKey.trim();
      next.aiModel = next.aiModel.trim();
      if (next.translationMode === "ai") {
        next.aiBaseUrl = normalizeAIBaseUrl(next.aiBaseUrl);
        await aiConfigured(next);
      }
      await serial(() => chrome.storage.local.set({ [CONFIG_KEY]: next }));
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
        await chrome.storage.local.set({ [CONFIG_KEY]: value });
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
      const { baseUrl, apiKey } = await aiConfigured(await config());
      return { models: await discoverModels({ baseUrl, apiKey }) };
    }
    case "ww:cache:clear":
      if (running.size)
        throw new RequestError("文章正在翻译，请完成后再清除本机文章。");
      await serial(async () => {
        const data = await library();
        data.jobs = [];
        pruneWords(data);
        await persist(data);
      });
      return null;
    case "ww:library:get":
      return snapshot();
    case "ww:library:open":
      await chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
      return null;
    case "ww:library:delete": {
      identifier(msg.id);
      if (running.has(msg.id))
        throw new RequestError("这篇文章正在翻译，请完成后再删除。");
      await serial(async () => {
        const data = await library();
        findJob(data, msg.id);
        data.jobs = data.jobs.filter((job) => job.id !== msg.id);
        pruneWords(data);
        await persist(data);
      });
      return null;
    }
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
      const data = await library();
      const job = findJob(data, msg.id);
      assertJobPage(job, sender, trusted);
      return publicJob(job, data.words);
    }
    case "ww:job:retry": {
      identifier(msg.id);
      const value = await translationConfig(await config());
      const signature = await providerSignature(value);
      let toLaunch: LocalJob | undefined;
      const result = await serial(async () => {
        const data = await library();
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
    case "ww:word:update": {
      identifier(msg.id);
      validatePatch(msg.patch);
      return serial(async () => {
        const data = await library();
        const word = data.words.find((entry) => entry.word.id === msg.id);
        if (!word) throw new RequestError("词条不存在或已删除。", 404);
        if (
          !trusted &&
          !data.jobs.some(
            (job) =>
              sourceUrl(job.input.sourceUrl) === pageUrl(sender) &&
              job.article?.version?.occurrences.some(
                (occurrence) => occurrence.vocabularyId === msg.id,
              ),
          )
        )
          throw new RequestError("不能从其他网页修改这个词条。", 403);
        word.word.user = patchUser(word.word.user ?? freshUser(), msg.patch);
        word.touched = Date.now();
        await persist(data);
        return word.word.user;
      });
    }
    case "ww:reader:open": {
      identifier(msg.id);
      const data = await library();
      const job = findJob(data, msg.id);
      assertJobPage(job, sender, trusted);
      await chrome.tabs.create({
        url: `${chrome.runtime.getURL("library.html")}?article=${encodeURIComponent(msg.id)}`,
      });
      return null;
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
