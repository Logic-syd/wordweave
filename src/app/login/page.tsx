import type { Metadata } from "next";
import { Suspense } from "react";
import { Layers } from "lucide-react";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "进入学习空间" };

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
        <h1 id="login-title">进入你的学习空间</h1>
        <p className={styles.intro}>
          用专属邀请码开始阅读，文章、词卡和学习进度会保存在你的空间里。
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
      </section>
      <p className={styles.footer}>让语言回到故事里。</p>
    </main>
  );
}
