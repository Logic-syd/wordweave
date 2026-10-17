import type { Metadata } from "next";
import { Download, ExternalLink } from "lucide-react";
import { SpriteIcon } from "@/components/sprite-icon";
import { ExtensionSetup } from "@/components/extension-setup";
import styles from "./extension.module.css";

export const metadata: Metadata = { title: "浏览器插件" };

export default function ExtensionPage() {
  return (
    <main className={`page ${styles.page}`}>
      <div className="create-heading">
        <span className="small-icon rose">
          <SpriteIcon size={30} />
        </span>
        <div>
          <span className="eyebrow">语境 · 浏览器插件</span>
          <h1>在正在读的网页里，学会表达。</h1>
        </div>
      </div>
      <p className={styles.lead}>
        把英文文章转换成中文为主、保留英文表达的学习版。点击词语看词卡，收藏同步到你的生词本。
      </p>
      <div className={styles.download}>
        <a
          className="button primary"
          href="/downloads/wordweave-extension.zip"
          download
        >
          <Download size={17} /> 下载 Chrome / Edge 插件
        </a>
        <span>桌面浏览器 · 个人体验版 · 解压后安装</span>
      </div>
      <section className={styles.step}>
        <h2>
          <span>1</span> 加载插件
        </h2>
        <ol className={styles.instructions}>
          <li>下载并解压 ZIP，将解压后的文件夹放在一个固定位置。</li>
          <li>
            在 Chrome 地址栏输入 <code>chrome://extensions</code>； Edge 输入{" "}
            <code>edge://extensions</code>。
          </li>
          <li>
            打开「开发者模式」→「加载已解压的扩展程序」，选择含有
            <code>manifest.json</code> 的文件夹，然后把「语境」固定到工具栏。
          </li>
        </ol>
      </section>
      <section className={styles.step}>
        <h2>
          <span>2</span> 连接你的语境网站
        </h2>
        <ExtensionSetup />
      </section>
      <section className={styles.step}>
        <h2>
          <span>3</span> 从一小段英文开始
        </h2>
        <ol className={styles.instructions}>
          <li>打开一篇英文文章，选中想读的一段文字。</li>
          <li>
            点击工具栏的语境图标，选择「选中段落」。在网页面板中确认段落数量和英文保留量，再开始生成。
          </li>
          <li>
            完成后在原网页阅读学习版，随时恢复原文。点击英文表达可以查看词卡、标记学习状态或收藏。
          </li>
        </ol>
        <a
          className={styles.example}
          href="https://react.dev/learn/state-as-a-snapshot"
          target="_blank"
          rel="noopener noreferrer"
        >
          试读 React：State as a Snapshot <ExternalLink size={15} />
        </a>
      </section>
      <p className={styles.note}>
        只有你点击开始生成才会把选定正文发送给语境服务和模型供应商。同一篇内容与设置会复用结果；
        失败后需手动重试。代码块保持原样，选区按完整段落处理。
      </p>
      <p className={styles.note}>
        首版支持普通网页正文，不支持 PDF、浏览器内部页面、iframe
        内正文或复杂网页应用。 每次最多 80 段、20,000
        字符；较长文章请分段选择。重新下载更新包后，在扩展管理页点击「重新加载」。
      </p>
    </main>
  );
}
