"use client";

import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import styles from "@/app/extension/extension.module.css";

export function ExtensionSetup() {
  const [message, setMessage] = useState("");
  const [fallbackAddress, setFallbackAddress] = useState("");
  const fallback = useRef<HTMLInputElement>(null);
  async function copyAddress(browser: "chrome" | "edge") {
    const address = `${browser}://extensions`;
    try {
      await navigator.clipboard.writeText(address);
      setFallbackAddress("");
      setMessage("已复制！粘贴到浏览器最上方的地址栏，按回车。");
    } catch {
      setFallbackAddress(address);
      setMessage("请复制下面的地址，粘贴到浏览器最上方的地址栏，按回车。");
      requestAnimationFrame(() => fallback.current?.select());
    }
  }
  return (
    <div className={styles.setup}>
      <div className={styles.copyGrid}>
        <button
          className={styles.copyButton}
          onClick={() => void copyAddress("chrome")}
        >
          <Copy size={17} /> 复制 Chrome 安装页地址
        </button>
        <button
          className={styles.copyButton}
          onClick={() => void copyAddress("edge")}
        >
          <Copy size={17} /> 复制 Edge 安装页地址
        </button>
      </div>
      <p className={styles.shortHint}>复制后，粘贴到浏览器地址栏，按回车。</p>
      <p role="status" className={styles.status}>
        {message}
      </p>
      {fallbackAddress && (
        <input
          ref={fallback}
          className={styles.address}
          aria-label="安装页地址"
          value={fallbackAddress}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
