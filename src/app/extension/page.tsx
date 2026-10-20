import type { Metadata } from "next";
import { Download, ExternalLink } from "lucide-react";
import { SpriteIcon } from "@/components/sprite-icon";
import { ExtensionSetup } from "@/components/extension-setup";
import styles from "./extension.module.css";

export const metadata: Metadata = { title: "安装语境小精灵" };

export default function ExtensionPage() {
  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.hero}>
        <span className={styles.sprite}>
          <SpriteIcon size={42} />
        </span>
        <div>
          <p className="eyebrow">语境 · 浏览器插件</p>
          <h1>把小精灵装进浏览器</h1>
          <p className={styles.lead}>
            英文网页，边翻译边学。默认免费，不用登录。
          </p>
        </div>
      </header>
      <div className={styles.steps}>
        <section className={styles.step}>
          <h2>
            <span>1</span> 下载
          </h2>
          <a
            className={styles.downloadButton}
            href="/downloads/wordweave-extension.zip"
            download
          >
            <Download size={21} /> 下载语境小精灵
          </a>
          <p className={styles.shortHint}>电脑上的 Chrome / Edge 都可以。</p>
        </section>
        <section className={styles.step}>
          <h2>
            <span>2</span> 解压
          </h2>
          <p className={styles.instruction}>
            右键刚下载的文件 → <strong>全部解压</strong>。
          </p>
          <p className={styles.shortHint}>
            Mac 双击文件即可。解压后的文件夹先别删。
          </p>
        </section>
        <section className={styles.step}>
          <h2>
            <span>3</span> 打开安装页
          </h2>
          <ExtensionSetup />
        </section>
        <section className={styles.step}>
          <h2>
            <span>4</span> 加进浏览器
          </h2>
          <p className={styles.instruction}>
            打开 <strong>开发者模式</strong> → 点{" "}
            <strong>加载已解压的扩展程序</strong> → 选择刚解压的文件夹。
          </p>
          <p className={styles.shortHint}>
            浏览器右上角点拼图 🧩，找到「语境」，固定到工具栏。
          </p>
        </section>
      </div>
      <section className={styles.ready}>
        <h2>装好了？读一小段试试。</h2>
        <p>
          打开英文网页 → 点小精灵 → <strong>翻译本页</strong>。
        </p>
        <a
          className={styles.example}
          href="https://react.dev/learn/state-as-a-snapshot"
          target="_blank"
          rel="noopener noreferrer"
        >
          打开一篇英文文章 <ExternalLink size={16} />
        </a>
      </section>
      <div className={styles.faq}>
        <details>
          <summary>没找到「开发者模式」？</summary>
          <p>
            Chrome 安装页在右上角，Edge
            通常在左侧。先打开开关，就会出现「加载已解压的扩展程序」。
          </p>
        </details>
        <details>
          <summary>提示无法加载，怎么办？</summary>
          <p>
            选择解压后的文件夹，不要选择 ZIP 压缩包。正确的文件夹打开后能看到
            manifest.json。如果外面还套着一层文件夹，就再往里选一层。
          </p>
        </details>
        <details>
          <summary>免费和 AI 有什么区别？</summary>
          <p>
            免费模式用翻译服务翻译正文，再按规则保留英文表达，可能不够自然。AI
            模式更灵活：点插件里的「设置」，选「AI 翻译」，填自己的 DeepSeek Key
            即可；费用由服务商收取。
          </p>
        </details>
        <details>
          <summary>文章和收藏存在哪里？</summary>
          <p>
            保存在当前浏览器，插件里的「文章与收藏」可以找到，不会同步到网站。清除插件数据或卸载插件会删除本机记录。只有点击翻译时，正文才会发送给当前选用的翻译服务。
          </p>
        </details>
        <details>
          <summary>如何更新？哪些网页不能翻译？</summary>
          <p>
            下载新版、解压并替换原文件夹，再到安装页点语境的「重新加载」，刷新文章网页即可。保留原文件夹路径，不要卸载插件，以免丢失本机收藏。暂不支持手机浏览器、PDF
            和浏览器设置页。长文可以先划选几段再翻译。
          </p>
        </details>
      </div>
    </main>
  );
}
