"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Copy, KeyRound } from "lucide-react";
import styles from "./login.module.css";

type Session = {
  authenticated: boolean;
  ownerId?: string;
  configured: boolean;
  enabled: boolean;
  error?: string;
};

function safeNextPath(value: string | null) {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === "/login")
      return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function TrialConfiguration() {
  const [configuration, setConfiguration] = useState("");
  const [notice, setNotice] = useState("");
  const output = useRef<HTMLTextAreaElement>(null);

  function generate() {
    try {
      const token = () =>
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      setConfiguration(
        JSON.stringify({ personal: token(), friend_anna: token() }, null, 2),
      );
      setNotice("配置已在当前浏览器生成，尚未保存到服务器。刷新页面会清除它。");
    } catch {
      setNotice("当前浏览器无法生成安全邀请码，请使用最新版浏览器重试。");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(configuration);
      setNotice("已复制配置，请粘贴到 Railway 的 TRIAL_ACCESS_TOKENS 变量中。");
    } catch {
      output.current?.focus();
      output.current?.select();
      setNotice("无法自动复制，已选中配置，请手动复制。");
    }
  }

  return (
    <details className={styles.setup}>
      <summary>我是管理员，设置试用邀请码</summary>
      <p>点击后会在当前浏览器生成两份独立邀请码，仅保留在本页内存中。</p>
      <button type="button" className={styles.secondary} onClick={generate}>
        <KeyRound size={16} aria-hidden="true" />
        {configuration ? "重新生成配置" : "生成试用配置"}
      </button>
      {configuration && (
        <>
          <label className={styles.outputLabel} htmlFor="trial-configuration">
            TRIAL_ACCESS_TOKENS 配置
          </label>
          <textarea
            ref={output}
            id="trial-configuration"
            value={configuration}
            readOnly
            rows={6}
            spellCheck={false}
            autoComplete="off"
            className={styles.output}
          />
          <button type="button" className={styles.secondary} onClick={copy}>
            <Copy size={15} aria-hidden="true" />
            复制配置
          </button>
          <ol>
            <li>
              把完整 JSON 填入 Railway → wordweave → Variables 的{" "}
              <code>TRIAL_ACCESS_TOKENS</code>，保存并重新部署。
            </li>
            <li>
              使用 <code>personal</code> 对应的引号内邀请码进入自己的空间。
            </li>
            <li>
              将 <code>friend_anna</code>{" "}
              对应的邀请码单独发给朋友，每人使用自己的邀请码。
            </li>
          </ol>
        </>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
    </details>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [checkError, setCheckError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      setCheckError("");
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: Session = await response.json();
        if (
          typeof data.authenticated !== "boolean" ||
          typeof data.configured !== "boolean" ||
          typeof data.enabled !== "boolean"
        )
          throw new Error("invalid session");
        setSession(data);
      } catch {
        if (!controller.signal.aborted)
          setCheckError("暂时无法检查访问设置，请稍后重试。");
      }
    }
    void check();
    return () => controller.abort();
  }, [attempt]);

  function enter() {
    window.location.assign(safeNextPath(params.get("next")));
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!token.trim()) {
      setError("请输入邀请码。");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    let navigating = false;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "暂时无法登录，请稍后重试。",
        );
        return;
      }
      setToken("");
      enter();
      navigating = true;
    } catch {
      setError("连接失败，请检查网络后重试。");
    } finally {
      if (!navigating) {
        submitting.current = false;
        setPending(false);
      }
    }
  }

  if (checkError)
    return (
      <div className={styles.help}>
        <p role="alert">{checkError}</p>
        <button
          className={styles.secondary}
          onClick={() => setAttempt((value) => value + 1)}
        >
          重新检查
        </button>
      </div>
    );
  if (!session)
    return (
      <p className={styles.status} role="status">
        正在检查访问设置…
      </p>
    );
  if (!session.enabled)
    return (
      <div className={styles.help}>
        <p>本地空间未启用邀请码，可以直接开始阅读。</p>
        <button className={styles.primary} onClick={enter}>
          进入学习空间 <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    );
  if (!session.configured)
    return (
      <div className={styles.help}>
        <h2>管理员尚未完成访问保护配置</h2>
        <p>
          请管理员在 Railway 中配置 <code>TRIAL_ACCESS_TOKENS</code>{" "}
          并重新部署，再使用分配给你的邀请码进入。
        </p>
        <TrialConfiguration />
      </div>
    );
  if (session.authenticated)
    return (
      <div className={styles.help}>
        <p>你已登录{session.ownerId ? `：${session.ownerId}` : ""}。</p>
        <button className={styles.primary} onClick={enter}>
          继续阅读 <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    );

  return (
    <form className={styles.form} onSubmit={login}>
      <label htmlFor="invitation-token">邀请码</label>
      <input
        id="invitation-token"
        name="token"
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="粘贴你的专属邀请码"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={512}
        disabled={pending}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "login-error" : "login-hint"}
      />
      <p id="login-hint" className={styles.hint}>
        向邀请你的人获取邀请码。请使用自己的邀请码，以保留独立的学习记录。
      </p>
      {error && (
        <p id="login-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        className={styles.primary}
        type="submit"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "正在进入…" : "进入学习空间"}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
  );
}
