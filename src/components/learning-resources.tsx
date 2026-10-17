import { ArrowUpRight, Compass } from "lucide-react";
import styles from "./learning-resources.module.css";

const groups = [
  {
    id: "english",
    title: "技术英语",
    hint: "先读熟悉技术的一小节，每次 300–600 个英文词就好。",
    resources: [
      {
        name: "React 官方教程",
        href: "https://react.dev/learn",
        tag: "前端 · 概念入门",
        description:
          "从组件、状态和 Effect 开始，用熟悉的代码理解常用英文表达。",
      },
      {
        name: "MDN Web Docs",
        href: "https://developer.mozilla.org/en-US/docs/Learn_web_development",
        tag: "Web · 系统学习",
        description:
          "JavaScript、浏览器与 HTTP。优先读教程和概念介绍，再查 API。",
      },
      {
        name: "Julia Evans 的博客",
        href: "https://jvns.ca/",
        tag: "Git · Linux · 调试",
        description: "围绕开发中真正遇到的问题展开，积累自然的解释与工作表达。",
      },
    ],
  },
  {
    id: "german",
    title: "德语 · A1–A2",
    hint: "从购物、通勤和咖啡这些生活场景开始，A1 短文也值得读。",
    resources: [
      {
        name: "DW · Nicos Weg",
        href: "https://learngerman.dw.com/",
        tag: "剧情课程 · 免费",
        description:
          "进入后选择 Nicos Weg A2，跟着生活故事练听力、词汇和语法。",
      },
      {
        name: "Lingua 德语阅读",
        href: "https://lingua.com/german/reading/",
        tag: "分级短文 · 部分免费",
        description: "选择 A1/A2 的生活短文，适合复制到语境，改成中文嵌词版。",
      },
      {
        name: "vhs 学习平台",
        href: "https://www.vhs-lernportal.de/",
        tag: "基础课程 · 免费",
        description: "选择 A2 德语课程，系统补冠词、格和动词变位这些基础。",
      },
    ],
  },
];

const firstReads = [
  {
    title: "State as a Snapshot",
    href: "https://react.dev/learn/state-as-a-snapshot",
  },
  {
    title: "Queueing a Series of State Updates",
    href: "https://react.dev/learn/queueing-a-series-of-state-updates",
  },
];

export function LearningResources() {
  return (
    <section
      id="learning-resources"
      className={styles.section}
      aria-labelledby="learning-resources-title"
    >
      <div className="section-heading">
        <h2 id="learning-resources-title">
          <Compass size={20} aria-hidden="true" />
          学习资源推荐
        </h2>
      </div>
      <p className={styles.intro}>
        为技术英语和德语起步挑选的学习网站，点击会在新标签页打开。
      </p>
      <div className={styles.grid}>
        {groups.map((group) => (
          <div
            key={group.id}
            className={`${styles.group} ${group.id === "english" ? styles.english : styles.german}`}
          >
            <div className={styles.groupHeading}>
              <h3>{group.title}</h3>
              <p>{group.hint}</p>
            </div>
            <ul className={styles.list}>
              {group.resources.map((resource) => (
                <li key={resource.href}>
                  <a
                    className={styles.resource}
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className={styles.resourceTitle}>
                      <strong>{resource.name}</strong>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </span>
                    <span className={styles.tag}>{resource.tag}</span>
                    <span className={styles.description}>
                      {resource.description}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={styles.firstReads}>
        <span>第一篇技术文章，可以从这两篇开始</span>
        <div>
          {firstReads.map((article) => (
            <a
              key={article.href}
              href={article.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {article.title}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
      <p className={styles.importTip}>
        找到想读的短文后，复制正文回到语境导入，也可以上传 TXT 或 Markdown。
        目前来源网址仅作记录，不会自动抓取网页。
      </p>
    </section>
  );
}
