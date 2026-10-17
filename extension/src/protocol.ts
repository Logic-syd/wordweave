import type { ArticleDetail, UserWord } from "../../src/lib/types";

export type { ArticleDetail, UserWord };

export type Retention = "low" | "medium" | "high";
export type GlossMode = "all" | "first" | "click";
export type ExtensionPreferences = { retention: Retention; glossMode: GlossMode };
export type ExtensionConfig = ExtensionPreferences & {
  serverUrl: string;
  accessToken: string;
};
export type ExtensionResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };
export type JobRecord = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  error?: string;
  article?: ArticleDetail;
};
export type ArticleInput = {
  title: string;
  sourceUrl: string;
  blocks: { id: string; markdown: string }[];
};
export type WordPatch = {
  status?: "LEARNING" | "KNOWN" | "IGNORED";
  favorite?: boolean;
  category?: "technical" | "general";
};
export type ExtensionMessage =
  | { type: "ww:config:get" }
  | { type: "ww:config:set"; config: ExtensionConfig }
  | { type: "ww:status" }
  | { type: "ww:preferences:get" }
  | { type: "ww:preferences:set"; retention?: Retention; glossMode?: GlossMode }
  | { type: "ww:job:start"; input: ArticleInput; retention: Retention }
  | { type: "ww:job:get"; id: string }
  | { type: "ww:job:retry"; id: string }
  | { type: "ww:word:update"; id: string; patch: WordPatch }
  | { type: "ww:reader:open"; id: string }
  | { type: "ww:cache:clear" };
export type ContentMessage =
  | { type: "ww:open"; scope: "article" | "selection" }
  | { type: "ww:restore" };

export const DEFAULT_CONFIG: ExtensionConfig = {
  serverUrl: "https://wordweave-production.up.railway.app",
  accessToken: "",
  retention: "medium",
  glossMode: "first",
};

/** Only a server origin is configurable; request paths remain fixed in the worker. */
export function normalizeServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请输入完整的网站地址，例如 https://wordweave-production.up.railway.app");
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("服务器地址必须使用 HTTPS；本机调试可使用 http://localhost。");
  }
  if (url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
    throw new Error("请仅填写网站地址，不要添加账号、路径或查询参数。");
  }
  return url.origin;
}

/** Chromium host permissions are host-wide; the actual API URL still keeps its port. */
export function permissionPattern(serverUrl: string): string {
  const url = new URL(normalizeServerUrl(serverUrl));
  return `${url.protocol}//${url.hostname}/*`;
}

export async function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as ExtensionResponse<T>;
  if (!response || !response.ok) {
    throw new Error(response && !response.ok ? response.error : "插件连接中断，请刷新网页后重试。");
  }
  return response.data;
}
