"use client";
import { ui } from "@/lib/ui";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Download, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import {
  browserAiReady,
  browserAiRemembered,
  browserCompletion,
  clearBrowserAi,
  emptyBrowserAi,
  modelEndpoint,
  readBrowserAi,
  saveBrowserAi,
  type BrowserAiConfig,
} from "@/lib/browser-ai";
import { browserData } from "@/lib/browser-store";
import { useHydrated } from "./use-hydrated";

function subscribe(callback: () => void) {
  window.addEventListener("wordweave:ai-config", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("wordweave:ai-config", callback);
    window.removeEventListener("storage", callback);
  };
}
export function useBrowserAi() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readBrowserAi()),
    () => JSON.stringify(emptyBrowserAi),
  );
  return JSON.parse(snapshot) as BrowserAiConfig;
}
export function LocalAiNotice() {
  const config = useBrowserAi();
  let destination = "";
  try {
    destination = new URL(config.baseUrl).host;
  } catch {
    /* Invalid values are explained in settings. */
  }
  return (
    <p className="local-ai-notice">
      <KeyRound size={14} />
      {browserAiReady(config) ? (
        <>
          {ui("使用我的 API ·")}
          {destination} / {config.model}
        </>
      ) : (
        <>{ui("范文、朗读和收藏免费使用；AI 功能需填写自己的 Key。")}</>
      )}
      <Link href="/settings">{ui("我的 API →")}</Link>
    </p>
  );
}
export function BrowserAiSettings() {
  return useHydrated() ? (
    <SettingsForm />
  ) : (
    <main className="page">
      <h1>{ui("我的 API")}</h1>
      <p>{ui("正在读取本地配置…")}</p>
    </main>
  );
}
function SettingsForm() {
  const [config, setConfig] = useState(readBrowserAi);
  const [remember, setRemember] = useState(browserAiRemembered);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function change(patch: Partial<BrowserAiConfig>) {
    setConfig((value) => ({ ...value, ...patch }));
    setMessage("");
    setError("");
  }
  function save() {
    try {
      saveBrowserAi(config, remember);
      setMessage(
        remember
          ? ui("已保存在这个浏览器，听说读都能使用。")
          : ui("已保存到当前浏览器会话，关闭此标签页后需要重新填写。"),
      );
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : ui("保存失败"));
      return false;
    }
  }
  async function test() {
    if (busy || !save()) return;
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
      setMessage(ui("连接成功，返回了有效 JSON。现在可以去生成或批改了。"));
    } catch (e) {
      setError(e instanceof Error ? e.message : ui("连接失败"));
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    try {
      const data = await browserData(false, (data) => data);
      const samples = localStorage.getItem("wordweave.samples.v1");
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                format: "wordweave-learning-export-v1",
                exportedAt: new Date().toISOString(),
                data,
                samples: samples ? JSON.parse(samples) : null,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "wordweave-learning.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(ui("已导出文章、词条和练习记录，不包含 API Key。"));
    } catch {
      setError(ui("导出失败，请检查浏览器存储权限。"));
    }
  }
  let host = ui("填写后显示");
  try {
    host = modelEndpoint(config).origin;
  } catch {
    /* Form validation displays the error on save. */
  }
  return (
    <main className="page api-settings-page">
      <span className="skill-kicker" data-skill="read">
        <KeyRound size={16} />
        {ui("我的 API / MY API")}
      </span>
      <h1>{ui("用自己的 Key，开始听说读。")}</h1>
      <p className="page-subtitle">
        {ui("不用注册。三个页面共用这里的配置。")}
      </p>
      <form
        className="api-settings-panel"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            {ui("API 地址（Base URL）")}
            <input
              value={config.baseUrl}
              onChange={(e) => change({ baseUrl: e.target.value })}
              placeholder="https://api.deepseek.com/v1"
              type="url"
              required
              autoComplete="off"
            />
          </label>
          <label>
            {ui("模型名称")}
            <input
              value={config.model}
              onChange={(e) => change({ model: e.target.value })}
              placeholder={ui("填写服务商当前提供的模型 ID")}
              required
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            {ui("自己的 API Key")}
            <input
              value={config.apiKey}
              onChange={(e) => change({ apiKey: e.target.value })}
              placeholder={ui("从模型服务商获取的 Key")}
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <details>
            <summary>{ui("高级设置")}</summary>
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
          </details>
          <label className="self-check-point">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>{ui("在这个浏览器记住 Key（公共设备请勿勾选）")}</span>
          </label>
          <p className="api-destination">
            <ShieldCheck size={16} />
            {ui("请求直接发送到")}
            <strong>{host}</strong>
            {ui("。Key 不会发给语境服务器。")}
          </p>
          <div className="practice-submit">
            <button type="submit" className="button primary">
              {ui("保存配置")}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void test()}
            >
              {busy ? ui("正在测试…") : ui("测试连接（使用少量额度）")}
            </button>
          </div>
        </fieldset>
        <button
          type="button"
          className="text-button remove-key"
          disabled={busy}
          onClick={() => {
            clearBrowserAi();
            setConfig({ ...config, apiKey: "" });
            setMessage(ui("API Key 已从当前浏览器移除，学习记录保留。"));
          }}
        >
          <Trash2 size={14} />
          {ui("移除 Key")}
        </button>
        {message && (
          <p className="practice-notice" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="practice-notice error" role="alert">
            {error}
          </p>
        )}
      </form>
      <section className="local-data-note">
        <h2>{ui("你的学习记录，留在你的浏览器。")}</h2>
        <p>
          {ui(
            "文章、词卡和进度保存在本地，不上传到语境。清除网站数据或更换浏览器后不会自动恢复。模型功能只把必要的材料和回答发送给你填写的服务商，费用由该 API 账户承担。",
          )}
        </p>
        <p>
          {ui(
            "浏览器直连需要服务商允许跨域请求（CORS）。如不支持，请换成支持网页直连的接口；网站不会使用站主的 Key 代付。",
          )}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => void exportData()}
        >
          <Download size={16} />
          {ui("导出学习记录（不含 Key）")}
        </button>
        <Link href="/listen">{ui("去听一段 →")}</Link>
      </section>
    </main>
  );
}
