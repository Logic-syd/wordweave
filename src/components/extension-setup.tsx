"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import styles from "@/app/extension/extension.module.css";

export function ExtensionSetup() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  function generate() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    setToken(
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
    setMessage("已在当前浏览器生成。请将同一个令牌填入 Railway 和插件设置。");
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label}已复制。`);
    } catch {
      setMessage("浏览器未允许复制，请选中输入框内容手动复制。");
    }
  }

  return (
    <div className={styles.setup}>
      <p>先生成一个专用于插件连接的令牌：</p>
      <button className="button secondary" onClick={generate}>
        <KeyRound size={16} />
        {token ? "重新生成令牌" : "生成专用令牌"}
      </button>
      {token && (
        <div className={styles.tokenRow}>
          <label>
            插件访问令牌
            <input
              type="password"
              value={token}
              readOnly
              autoComplete="off"
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            className="button secondary"
            onClick={() => void copy(token, "令牌")}
          >
            <Copy size={15} /> 复制令牌
          </button>
        </div>
      )}
      <p className={styles.note}>
        令牌只在这个页面临时显示，不会上传或自动保存。刷新前请完成下面两处配置。
        以后更换令牌，也需同时更新 Railway 和插件。
      </p>
      <p role="status" className={styles.status}>
        {message}
      </p>
      <ol className={styles.instructions}>
        <li>
          打开 Railway 的 <strong>wordweave → Variables</strong>，新增变量
          <code>EXTENSION_ACCESS_TOKEN</code>，值填入刚才复制的令牌，然后点击
          Deploy。
        </li>
        <li>
          打开浏览器中的语境插件 →
          连接设置，把同一个令牌粘贴到「插件访问令牌」。
        </li>
        <li>
          服务器地址填你的语境网站地址，保存并授权连接，然后点击「测试连接」。
          <button
            className="button secondary"
            onClick={() => void copy(window.location.origin, "当前网站地址")}
          >
            <Copy size={15} /> 复制当前网站地址
          </button>
        </li>
      </ol>
      <p className={styles.note}>
        这是语境的连接口令。DeepSeek API Key 继续留在 Railway 的 LLM_API_KEY
        中。
      </p>
    </div>
  );
}
