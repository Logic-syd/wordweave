import type { Metadata } from "next";
import { Suspense } from "react";
import { Layers } from "lucide-react";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";
import Link from "next/link";

export const metadata: Metadata = { title: "旧版私人数据入口" };

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
        <p className={styles.eyebrow}>一点一点，读懂更多</p>
        <h1 id="login-title">旧版私人数据入口</h1>
        <p className={styles.intro}>
          仅供站主访问原有数据库记录。公开版听、说、读无需登录，使用自己的 API，记录保存在浏览器。
        </p>
        <Suspense
          fallback={
            <p className={styles.status} role="status">
              正在检查访问设置…
            </p>
          }
        >
          <LoginForm />
        </Suspense>
        <Link href="/">进入公开学习页面 →</Link>
      </section>
      <p className={styles.footer}>让语言回到故事里。</p>
    </main>
  );
}
