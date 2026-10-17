"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
  X,
} from "lucide-react";
import styles from "./invites.module.css";

type Invitation = {
  id: string;
  ownerId: string;
  label: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};
type InvitationResult = {
  invitation: Invitation;
  token: string | null;
  replayed: boolean;
};
type InvitationList = {
  invitations: Invitation[];
  legacyInvitationsManaged: boolean;
};
type Confirmation = {
  id: string;
  action: "revoke" | "rotate";
  requestKey: string;
};
class InvitationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new InvitationError(
        data?.error || "操作未完成，请稍后重试。",
        response.status,
      );
    if (!data || typeof data !== "object")
      throw new InvitationError("服务器未返回有效结果，请重新检查。");
    return data as T;
  } catch (error) {
    if (error instanceof InvitationError) throw error;
    throw new InvitationError(
      "连接中断，操作可能已经完成。再次点击会检查同一次操作，不会重复执行。",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function createdDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function Invitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [createAttempt, setCreateAttempt] = useState<{
    label: string;
    requestKey: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [fresh, setFresh] = useState<{
    invitation: Invitation;
    token: string;
    link: string;
  } | null>(null);
  const [copied, setCopied] = useState<"token" | "link" | null>(null);
  const [legacyUnmanaged, setLegacyUnmanaged] = useState(false);
  const pending = useRef(false);
  const tokenField = useRef<HTMLTextAreaElement>(null);
  const linkField = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const result = await request<InvitationList>("/api/invitations");
      setInvitations(result.invitations);
      setLegacyUnmanaged(!result.legacyInvitationsManaged);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "暂时无法读取邀请列表。",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function applyResult(
    result: InvitationResult,
    action: "create" | "rotate" | "revoke",
  ) {
    setInvitations((previous) => [
      result.invitation,
      ...previous.filter((item) => item.id !== result.invitation.id),
    ]);
    setCopied(null);
    if (result.token) {
      setFresh({
        invitation: result.invitation,
        token: result.token,
        link: `${window.location.origin}/login#invite=${encodeURIComponent(result.token)}`,
      });
      setNotice(
        action === "rotate"
          ? "新的邀请码已生成。旧邀请码已失效，朋友的学习记录会保留。"
          : "邀请已准备好，把邀请链接发给这位朋友即可。",
      );
    } else if (action === "revoke") {
      if (fresh?.invitation.id === result.invitation.id) setFresh(null);
      setNotice("邀请已撤销。对方需要新的邀请码才能再次进入，学习记录会保留。");
    } else {
      if (fresh?.invitation.id === result.invitation.id) setFresh(null);
      setNotice(
        "上次操作已经完成。邀请码只显示一次，这次无法再次查看；请在下方为这份邀请重新生成邀请码。",
      );
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const attempt = createAttempt ?? {
      label: label.trim() || `朋友 ${invitations.length + 1}`,
      requestKey: crypto.randomUUID(),
    };
    pending.current = true;
    setCreateAttempt(attempt);
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const result = await request<InvitationResult>("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      });
      applyResult(result, "create");
      setCreateAttempt(null);
      setLabel("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "暂时无法创建邀请。");
      if (
        error instanceof InvitationError &&
        error.status &&
        error.status < 500
      )
        setCreateAttempt(null);
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function confirm() {
    if (!confirmation || pending.current) return;
    const action = confirmation;
    pending.current = true;
    setBusy(action.id);
    setError("");
    setNotice("");
    try {
      const result = await request<InvitationResult>(
        `/api/invitations/${encodeURIComponent(action.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: action.action,
            requestKey: action.requestKey,
          }),
        },
      );
      applyResult(result, action.action);
      setConfirmation(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作未完成，请重试。");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function copy(kind: "token" | "link") {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh[kind]);
      setCopied(kind);
      setNotice(kind === "link" ? "邀请链接已复制。" : "邀请码已复制。");
    } catch {
      const field = kind === "link" ? linkField.current : tokenField.current;
      field?.focus();
      field?.select();
      setNotice("浏览器没有允许自动复制，已选中文字，请手动复制。");
    }
  }

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.heading}>
        <p className="eyebrow">一起读一点</p>
        <h1>
          <UserRoundPlus size={27} aria-hidden="true" />
          邀请朋友
        </h1>
        <p>
          给每位朋友一份专属邀请。文章、词卡和学习进度会保存在各自的空间里。
        </p>
      </header>

      <section
        className={styles.create}
        aria-labelledby="create-invitation-title"
      >
        <h2 id="create-invitation-title">准备一份新邀请</h2>
        <form onSubmit={create}>
          <div className={styles.labelField}>
            <label htmlFor="invitation-label">
              给自己看的备注 <span>可选</span>
            </label>
            <input
              id="invitation-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={60}
              placeholder="例如：小林、德语学习搭子"
              disabled={Boolean(busy || createAttempt)}
            />
          </div>
          <button
            className="button primary"
            type="submit"
            disabled={Boolean(busy)}
            aria-busy={busy === "create"}
          >
            {busy === "create" ? (
              <LoaderCircle size={17} className="spin" aria-hidden="true" />
            ) : (
              <Plus size={17} aria-hidden="true" />
            )}
            {busy === "create"
              ? "正在准备…"
              : createAttempt
                ? "检查上次生成结果"
                : "生成邀请码"}
          </button>
        </form>
        <p className={styles.hint}>
          一位朋友使用一份邀请；转发同一份邀请会进入同一个学习空间。
        </p>
      </section>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {fresh && (
        <section
          className={styles.fresh}
          aria-labelledby="fresh-invitation-title"
        >
          <div className={styles.freshHeading}>
            <h2 id="fresh-invitation-title">
              <Check size={18} aria-hidden="true" />
              {fresh.invitation.label}的邀请
            </h2>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="收起本次邀请码"
              onClick={() => setFresh(null)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p>
            邀请码只在本次生成后显示，请及时复制。离开页面后无法从列表找回，可以重新生成。
          </p>
          <label htmlFor="fresh-invitation-link">邀请链接</label>
          <div className={styles.copyRow}>
            <input
              id="fresh-invitation-link"
              ref={linkField}
              value={fresh.link}
              readOnly
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="button secondary"
              onClick={() => void copy("link")}
            >
              <Link2 size={16} aria-hidden="true" />
              {copied === "link" ? "已复制链接" : "复制邀请链接"}
            </button>
          </div>
          <label htmlFor="fresh-invitation-token">邀请码</label>
          <div className={styles.copyRow}>
            <textarea
              id="fresh-invitation-token"
              ref={tokenField}
              value={fresh.token}
              readOnly
              rows={2}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="button secondary"
              onClick={() => void copy("token")}
            >
              <Copy size={16} aria-hidden="true" />
              {copied === "token" ? "已复制邀请码" : "复制邀请码"}
            </button>
          </div>
        </section>
      )}

      <section
        className={styles.listSection}
        aria-labelledby="invitation-list-title"
      >
        <div className={styles.listHeading}>
          <h2 id="invitation-list-title">已发出的邀请</h2>
          <button
            type="button"
            className="text-button"
            onClick={() => void load()}
            disabled={loading || Boolean(busy)}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? "正在读取…" : "刷新列表"}
          </button>
        </div>
        {listError && (
          <p className={styles.error} role="alert">
            {listError}
          </p>
        )}
        {!loading && !listError && invitations.length === 0 && (
          <div className={styles.empty}>
            <UserRoundPlus size={26} aria-hidden="true" />
            <p>还没有发出邀请。先为一位朋友生成邀请码吧。</p>
          </div>
        )}
        {invitations.length > 0 && (
          <ul className={styles.list}>
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <div className={styles.invitationRow}>
                  <div className={styles.invitationInfo}>
                    <h3>{invitation.label}</h3>
                    <p>创建于 {createdDate(invitation.createdAt)}</p>
                  </div>
                  <span
                    className={
                      invitation.active ? styles.active : styles.revoked
                    }
                  >
                    {invitation.active ? "有效" : "已撤销"}
                  </span>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className="text-button"
                      disabled={Boolean(busy || createAttempt)}
                      onClick={() => {
                        setConfirmation({
                          id: invitation.id,
                          action: "rotate",
                          requestKey: crypto.randomUUID(),
                        });
                        setError("");
                      }}
                    >
                      重新生成邀请码
                    </button>
                    {invitation.active && (
                      <button
                        type="button"
                        className={styles.revokeButton}
                        disabled={Boolean(busy || createAttempt)}
                        onClick={() => {
                          setConfirmation({
                            id: invitation.id,
                            action: "revoke",
                            requestKey: crypto.randomUUID(),
                          });
                          setError("");
                        }}
                      >
                        撤销
                      </button>
                    )}
                  </div>
                </div>
                {confirmation?.id === invitation.id && (
                  <div
                    className={styles.confirmation}
                    role="group"
                    aria-label={
                      confirmation.action === "revoke"
                        ? "确认撤销邀请"
                        : "确认重新生成邀请码"
                    }
                  >
                    <p>
                      {confirmation.action === "revoke"
                        ? "撤销后，这份邀请码和已登录的会话都会失效。对方的学习记录仍会保留。"
                        : invitation.active
                          ? "旧邀请码和已登录的会话将失效。新的邀请码会继续使用同一个学习空间，之前的记录会保留。"
                          : "将生成新的邀请码并重新启用这份邀请。之前的学习记录会保留。"}
                    </p>
                    <div>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void confirm()}
                        disabled={Boolean(busy)}
                      >
                        {busy === invitation.id
                          ? "正在处理…"
                          : confirmation.action === "revoke"
                            ? "确认撤销"
                            : "确认重新生成"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setConfirmation(null)}
                        disabled={Boolean(busy)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {legacyUnmanaged && (
          <p className={styles.hint}>
            这里只管理在本页创建的邀请。之前发出的旧邀请码仍可使用，但不在此列表中。
          </p>
        )}
      </section>
      <p className={styles.footer}>
        <ShieldCheck size={16} aria-hidden="true" />
        只有站主可以生成和管理邀请。
      </p>
    </main>
  );
}
