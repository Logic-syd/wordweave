/** Browser-only transport. Credentials never enter returned errors or articles. */
export class TranslationError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

export async function readBoundedJson(response: Response, limit: number): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new TranslationError("翻译服务返回的内容过大，已停止读取。");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new TranslationError("翻译服务返回了空响应。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new TranslationError("翻译服务返回的内容过大，已停止读取。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new TranslationError("翻译服务返回了无效 JSON。", true);
  }
}

export async function requestJson(
  fetcher: typeof fetch,
  url: string | URL,
  init: RequestInit,
  options: { timeout: number; limit: number; label: string; signal?: AbortSignal },
): Promise<unknown> {
  try {
    const response = await fetcher(url, {
      ...init,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(options.timeout),
        ...(options.signal ? [options.signal] : []),
      ]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const detail = response.status === 401 || response.status === 403
        ? options.label.startsWith("免费") ? "服务暂不可用或网络访问受限。" : "请检查 API Key 和服务访问权限。"
        : response.status === 429
          ? "请求受限，请稍后再试。"
          : "请稍后重试。";
      throw new TranslationError(`${options.label}请求失败（${response.status}）。${detail}`, response.status >= 500);
    }
    return await readBoundedJson(response, options.limit);
  } catch (error) {
    if (error instanceof TranslationError) throw error;
    throw new TranslationError(`${options.label}连接失败或超时。请检查网络与服务地址后重试。`);
  }
}

/** Concurrency applies to all requests, including phrase lookups. */
export function requestQueue(concurrency = 2) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(action: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await action();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
