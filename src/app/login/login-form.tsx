"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
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

export function LoginForm() {
  const params = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [checkError, setCheckError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState("");
  const [linkedInvitation, setLinkedInvitation] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (!fragment.has("invite")) return;
    const invitation = fragment.get("invite") ?? "";
    // A fragment never reaches the server. Remove it before any subsequent
    // session request or user navigation, and keep the token only in memory.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    queueMicrotask(() => {
      setLinkedInvitation(true);
      if (/^[\x21-\x7e]{32,512}$/.test(invitation)) setToken(invitation);
      else setError("邀请链接不完整，请向邀请你的人获取新的链接或邀请码。");
    });
  }, []);

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
        <h2>站主还没有完成首次设置</h2>
        <p>请站主先设置登录凭据。完成后，就能直接在网页里生成邀请。</p>
        <details className={styles.setup}>
          <summary>我是站主，查看首次设置</summary>
          <p>
            在部署平台设置 <code>ADMIN_ACCESS_TOKEN</code>，使用至少 32
            个字符的随机值，
            保存并重新部署一次。用这个凭据登录后，点击「邀请朋友」即可。
          </p>
          <p>已经配置过的站主邀请码或插件访问令牌也可以继续使用。</p>
        </details>
      </div>
    );
  if (session.authenticated && !linkedInvitation)
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
      {linkedInvitation && (
        <p className={styles.inviteReady} role="status">
          {session.authenticated
            ? "你已登录另一个学习空间。确认后，将使用这份邀请进入对应空间。"
            : "邀请已填好，点击下方按钮进入你的学习空间。"}
        </p>
      )}
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
