"use client";
import { ui } from "@/lib/ui";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Download, KeyRound } from "lucide-react";
import {
  browserAiReady,
  emptyBrowserAi,
  readBrowserAi,
  type BrowserAiConfig,
} from "@/lib/browser-ai";
import { browserData } from "@/lib/browser-store";
import { useHydrated } from "./use-hydrated";
import { BrowserAiConnection } from "./browser-ai-connection";

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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function exportData() {
    setError("");
    setMessage("");
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
  return (
    <main className="page api-settings-page">
      <span className="skill-kicker" data-skill="read">
        <KeyRound size={16} />
        {ui("我的 API / MY API")}
      </span>
      <h1>{ui("免费学习，AI 按需开启。")}</h1>
      <p className="page-subtitle">
        {ui("使用 AI 时填自己的 Key。三个页面共用，无需注册。")}
      </p>
      <BrowserAiConnection />
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
        <p>
          JSON 备份不包含音频文件，请保留原始音频。 / JSON backups exclude audio
          files. Keep your original recordings.
        </p>
        <Link href="/listen">{ui("去听一段 →")}</Link>
      </section>
    </main>
  );
}
