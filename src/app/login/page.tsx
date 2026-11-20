import { ui } from "@/lib/ui";
/* eslint-disable @next/next/no-html-link-for-pages -- Enter the public workspace with a full document load. */
import type { Metadata } from "next";
import { Suspense } from "react";
import { Layers } from "lucide-react";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = { title: ui("旧版私人数据入口") };

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brand}>
          <span className={styles.mark}>
            <Layers size={25} aria-hidden="true" />
          </span>
          <span>
            语境<small>WORDS IN CONTEXT</small>
          </span>
        </div>
        <p className={styles.eyebrow}>{ui("一点一点，读懂更多")}</p>
        <h1 id="login-title">{ui("旧版私人数据入口")}</h1>
        <p className={styles.intro}>
          {ui(
            "仅供站主访问原有数据库记录。公开版听、说、读无需登录，使用自己的 API，记录保存在浏览器。",
          )}
        </p>
        <Suspense
          fallback={
            <p className={styles.status} role="status">
              {ui("正在检查访问设置…")}
            </p>
          }
        >
          <LoginForm />
        </Suspense>
        <a href="/">{ui("进入公开学习页面 →")}</a>
      </section>
      <p className={styles.footer}>{ui("让语言回到故事里。")}</p>
    </main>
  );
}
