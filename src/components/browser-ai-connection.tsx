"use client";

import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import {
  BROWSER_AI_PROVIDERS,
  browserAiProvider,
  browserAiRemembered,
  browserCompletion,
  clearBrowserAi,
  modelEndpoint,
  readBrowserAi,
  saveBrowserAi,
  type BrowserAiConfig,
  type BrowserAiProvider,
} from "@/lib/browser-ai";
import { ui } from "@/lib/ui";

/** Shared by the reading inbox and settings; saving never makes a model request. */
export function BrowserAiConnection({
  inline = false,
  onSaved,
  onCancel,
}: {
  inline?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [config, setConfig] = useState(readBrowserAi);
  const [provider, setProvider] = useState<BrowserAiProvider | "">(() =>
    browserAiProvider(config.baseUrl),
  );
  const [remember, setRemember] = useState(browserAiRemembered);
  const [canRemove, setCanRemove] = useState(() =>
    Boolean(readBrowserAi().apiKey),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function change(patch: Partial<BrowserAiConfig>) {
    setConfig((previous) => ({ ...previous, ...patch }));
    setMessage("");
    setError("");
  }
  function save() {
    try {
      saveBrowserAi(config, remember);
      setCanRemove(true);
      setMessage(ui("配置已保存，可导入文章生成学习版。"));
      setError("");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : ui("保存失败"));
    }
  }
  async function test() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = await browserCompletion(
        'Return only JSON: {"ok":true}.',
        { task: "connection check" },
        undefined,
        config,
      );
      if (
        !value ||
        typeof value !== "object" ||
        !("ok" in value) ||
        value.ok !== true
      )
        throw new Error(
          ui("已连接，但模型未按要求返回 JSON。请确认模型支持结构化输出。"),
        );
      setMessage(ui("连接成功。点击保存即可继续。"));
    } catch (e) {
      setError(e instanceof Error ? e.message : ui("连接失败"));
    } finally {
      setBusy(false);
    }
  }
  let destination = "";
  try {
    destination = modelEndpoint(config).origin;
  } catch {
    // Invalid drafts are explained on save or test; never send a request here.
  }
  return (
    <form
      className={`api-settings-panel api-connection${inline ? " api-connection-inline" : ""}`}
      aria-label={ui("填写自己的 API")}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {inline && (
        <div className="api-connection-heading">
          <h3>
            <KeyRound size={17} />
            {ui("用自己的 API 翻译文章")}
          </h3>
          <p>{ui("填好后，这里会展开文章导入。")}</p>
        </div>
      )}
      <fieldset disabled={busy}>
        <label>
          {ui("AI 服务商")}
          <select
            value={provider}
            required
            onChange={(e) => {
              const next = e.target.value as BrowserAiProvider | "";
              setProvider(next);
              // A different destination must never inherit the previous provider's key.
              change({
                baseUrl: next ? BROWSER_AI_PROVIDERS[next].baseUrl : "",
                apiKey: "",
                model: "",
                thinking: "auto",
              });
            }}
          >
            <option value="" disabled>
              {ui("选择服务商")}
            </option>
            {Object.entries(BROWSER_AI_PROVIDERS).map(([id, value]) => (
              <option key={id} value={id}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        {provider === "custom" && (
          <label>
            {ui("API 地址（Base URL）")}
            <input
              value={config.baseUrl}
              onChange={(e) => change({ baseUrl: e.target.value, apiKey: "" })}
              type="url"
              placeholder="https://…/v1"
              required
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        <label>
          {ui("自己的 API Key")}
          <input
            value={config.apiKey}
            onChange={(e) => change({ apiKey: e.target.value })}
            placeholder={ui("粘贴自己的 Key")}
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          {ui("模型名称")}
          <input
            value={config.model}
            onChange={(e) => change({ model: e.target.value })}
            placeholder={ui("填写服务商提供的模型 ID")}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {destination && (
          <p className="api-endpoint">
            {ui("直连服务商")}: <span>{destination}</span>
          </p>
        )}
        <div className="api-key-notice">
          <p>
            {ui(
              "Key 不上传到语境服务器。使用 AI 时，Key 和待处理文本直接发送给你选择的服务商。",
            )}
          </p>
          <p>
            {remember
              ? ui("Key 将保存在这个浏览器，直到你主动移除。")
              : ui("默认仅在当前标签页会话保存 Key，不长期记住。")}
          </p>
        </div>
        <details className="api-key-options">
          <summary>{ui("存储与高级设置")}</summary>
          <label className="self-check-point">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>{ui("在这个浏览器记住 Key（公共设备请勿勾选）")}</span>
          </label>
          <p className="field-hint">
            {ui(
              "浏览器存储并非保险箱。请使用单独的限额 Key；勿在不信任的设备上保存。",
            )}
          </p>
          {provider !== "anthropic" && (
            <label>
              {ui("深度思考")}
              <select
                value={config.thinking}
                onChange={(e) =>
                  change({
                    thinking: e.target.value as BrowserAiConfig["thinking"],
                  })
                }
              >
                <option value="auto">
                  {ui("自动（DeepSeek 默认关闭，加快响应）")}
                </option>
                <option value="disabled">{ui("关闭")}</option>
                <option value="enabled">{ui("开启")}</option>
              </select>
            </label>
          )}
          <p className="field-hint">
            {ui(
              "浏览器直连需服务商允许跨域请求。连接失败时不会转用网站的 Key。",
            )}
          </p>
        </details>
        {error && (
          <p className="practice-notice error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="practice-notice" role="status">
            {message}
          </p>
        )}
        <div className="api-connection-actions">
          <button type="submit" className="button primary">
            {inline ? ui("保存并继续") : ui("保存配置")}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => void test()}
          >
            {busy ? ui("正在测试…") : ui("测试连接（使用少量额度）")}
          </button>
        </div>
      </fieldset>
      <div className="api-connection-secondary">
        {onCancel && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onCancel}
          >
            {ui("取消")}
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            className="text-button remove-key"
            disabled={busy}
            onClick={() => {
              clearBrowserAi();
              change({ apiKey: "" });
              setRemember(false);
              setCanRemove(false);
              setMessage(ui("API Key 已从当前浏览器移除，学习记录保留。"));
            }}
          >
            <Trash2 size={14} />
            {ui("移除 Key")}
          </button>
        )}
      </div>
    </form>
  );
}
