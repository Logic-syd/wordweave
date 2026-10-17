"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import styles from "@/app/extension/extension.module.css";

export function ExtensionSetup() {
  const [message, setMessage] = useState("");
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setMessage("网站地址已复制。");
    } catch {
      setMessage("请手动复制浏览器地址栏中的网站根地址。");
    }
  }
  return (
    <div className={styles.setup}>
      <p>
        插件使用你登录网站时的同一个邀请码，收藏和文章会进入你自己的学习空间。
      </p>
      <ol className={styles.instructions}>
        <li>打开浏览器中的语境插件 →「连接设置」。</li>
        <li>
          服务器地址填写当前语境网站的根地址。
          <button
            className="button secondary"
            onClick={() => void copyAddress()}
          >
            <Copy size={15} /> 复制当前网站地址
          </button>
        </li>
        <li>
          将你自己的邀请码填入「插件访问令牌」，点击「保存并授权连接」，再点击「测试连接」。
        </li>
      </ol>
      <p role="status" className={styles.status}>
        {message}
      </p>
      <p className={styles.note}>
        给朋友试用时，请为每个人分配独立邀请码。共用邀请码会共用文章、收藏和额度。
        DeepSeek API Key 继续只保存在网站服务端，不要填进插件。
      </p>
    </div>
  );
}
