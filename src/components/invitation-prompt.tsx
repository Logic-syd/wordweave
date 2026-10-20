"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function InvitationPrompt({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "验证失败");
      onSuccess();
    } catch (error) {
      setError(error instanceof Error ? error.message : "连接失败，请重试。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="invite-prompt"
      aria-labelledby="invite-prompt-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id="invite-prompt-title">创建文章需要邀请码</h2>
      <p>读范文、用插件都不需要。向站主领取邀请码后，就能上传和生成文章。</p>
      <form onSubmit={login}>
        <label htmlFor="upload-invite">邀请码</label>
        <input
          id="upload-invite"
          type="password"
          autoComplete="off"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="粘贴邀请码"
          maxLength={512}
        />
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="invite-prompt-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            暂时不用
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "正在验证…" : "验证并继续"}
          </button>
        </div>
      </form>
      <Link href="/library">先读免费范文 →</Link>
    </dialog>
  );
}
