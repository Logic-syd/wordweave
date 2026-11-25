# 免费每日阅读 / Free daily reading

英语每日两篇原创长文，每篇至少 1,000 个英文正文词。站主的 DeepSeek 在发布前生成英文原稿、三档语境学习版，再做逐段润色和独立审校。读者免费阅读，无需 Key；个人文章生成仍使用读者自己的 Key。

Two original English long reads per day, each with at least 1,000 prose words. The owner's DeepSeek account prepares the source, all three learning levels, a prose editing pass and a separate editorial review. Reading is free and needs no key. Personal article generation remains BYOK.

## 启用自动发布 / Enable scheduled publishing

在 GitHub 仓库 `Logic-syd/wordweave` 的 Settings → Secrets and variables → Actions 设置一次：

| 位置 / Location     | 名称 / Name              | 内容 / Value                                                                                |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Repository secret   | `DAILY_DEEPSEEK_API_KEY` | 你自己的真实 DeepSeek API Key / Your real DeepSeek API key                                  |
| Repository variable | `DAILY_DEEPSEEK_MODEL`   | 你账户可用、支持 JSON 输出的模型标识 / An available model identifier supporting JSON output |

不要把 Key 写进代码、公开变量或 Netlify 的浏览器环境变量。云开发环境中的域名绑定占位密钥不能复制到 Actions；请从 DeepSeek 控制台取得真实 Key。模型名不硬编码，升级或换模型改上述变量即可。

Use a **secret** for the key, not a plain repository variable or a browser/Netlify variable. Domain-bound credential placeholders from a managed development environment cannot be copied to Actions. Obtain the actual key from DeepSeek. Model identifiers are configurable rather than hard-coded.

随后打开 Actions → **Prepare daily reading** → **Run workflow**。日期留空使用柏林当天。第一次手动运行成功后，每天 UTC 03:17 调度；GitHub 可能延迟运行，公开仓库长期无活动时也可能停用定时任务。可以查看失败日志后重跑，同日期已完成的版本不会重复调用模型。

Run **Prepare daily reading** once from Actions, leaving the date blank for today in Berlin. The cron runs at 03:17 UTC, subject to GitHub scheduling delays or inactivity-based disabling. Inspect failed logs before rerunning. An already completed date makes no model calls.

代码在 `main`，公开内容在独立 `daily-content` 分支（首次内容分支需先存在）：

```text
index.json                       日期与 SHA-256 清单 / Date and SHA-256 manifest
editions/YYYY-MM-DD.json          两篇已校验文章 / Two validated articles
```

网站直接下载已发布 JSON，并缓存到浏览器。不因每天更新文章而触发 `main` 的 Netlify 构建；网络失败或当天未成功发布时保留最近一期，显示真实日期。已有收藏永久指向对应期次，已收藏词卡另有本地快照。旧的内置范文仍保留。

The site fetches public JSON and caches it locally. Daily content updates do not rebuild the Netlify site connected to `main`. Missing or failed editions fall back to the latest successful issue with an honest date. Saved links retain their edition IDs, and saved word cards have local snapshots. Legacy bundled samples remain available.

## 本机运行 / Local run

`npm ci` 后，设置服务端环境变量 `DAILY_DEEPSEEK_API_KEY`、`DAILY_DEEPSEEK_MODEL`。本机也可复用已有 `LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`；只允许官方 `api.deepseek.com` 地址。受管云环境中 Node 直连需使用已有代理：

```bash
NODE_USE_ENV_PROXY=1 npm run daily:generate -- --date 2026-11-25
```

输出默认在 `.local/daily-feed/`，检查通过后才把该目录的清单和文章提交到 `daily-content`。私有 `.local/daily-publisher/<日期>/journal.json` 保存预算、成功分块与检查点；不要提交它。进程被强制终止时可能留锁，确认进程已停止后才移除对应 `publisher.lock`。不要删除 journal 来绕过当天预算。

After `npm ci`, configure the server-side `DAILY_DEEPSEEK_*` variables, or use the existing `LLM_*` configuration locally. Only the official DeepSeek host is allowed. The command above uses the managed environment's existing Node proxy. Output is staged in `.local/daily-feed/`; publish only its manifest and edition files to `daily-content`. Keep the private journal for resumable work and the day's budget. Remove a stale lock only after confirming the process stopped; never delete the journal to bypass limits.

## 发布约束 / Publication checks

- 原稿需 1,100–1,700 英文正文词，最终成品至少 1,000 词。代码不计入篇幅，不交给翻译模型改写；行内代码、链接和段落对应均验证。
- 三档分别生成并润色，实际英文保留量递增。词卡必须出现在正文，原句对应原段；引用词形匹配原句。评分和结构不能代替人工核实所有事实。首期另有一处否定句校对，记录在 `src/content/daily-editorial-edits.json`，应用修正后重新审校。
- 独立审校通过且没有阻止发布的问题，两篇才一起写出。失败不会覆盖旧成品；日期发布后不可改写，修订请使用新期次。
- 每日期 journal 上限 **50 次模型请求、1,200,000 输入字符**，每次输入最多 160,000 字符、输出最多 12,000 tokens / 2 MiB。整次作业 24 分钟、单请求 120 秒，普通失败有限重试，遇到鉴权、余额、拒绝或不可重试错误停止。这些是保护上限，不是每日预估用量或精确账单；供应商可能对失败调用收费。
- Actions 缓存只保存该日期的 journal，重跑复用成功阶段；缓存被删除、失效或换日期会失去该日期预算记录，不能代替供应商账户的消费限制。定期查看 DeepSeek 余额与实际用量。

Drafts target 1,100–1,700 English prose words. Publication requires at least 1,000, exact protected content and paragraph alignment, real word-card occurrences, increasing English retention, and a passing separate editorial review. Both articles publish atomically; existing editions are immutable. Review is model-based and does not establish perfect linguistic or factual accuracy.

The persisted daily journal caps requests at **50**, total input characters at **1,200,000**, per-request input at 160,000 characters, and output at 12,000 tokens / 2 MiB. Jobs have a 24-minute deadline and 120-second request timeout, with bounded retries and terminal handling for authentication, balance, refusal and non-retryable errors. These caps are not usage forecasts or a precise monetary budget; failed requests may be billed. Actions caches preserve completed stages and counters, but cache deletion/expiry or a different date can reset available state. Monitor actual provider usage and account limits.

听力、口语和德语仍使用原有内置轮换；这套每日编辑流程当前覆盖英语阅读。没有新建账户系统、公开站主付费 API 或编辑管理页面。PostgreSQL、Prisma 和原服务端 API 继续保留。

Listening, speaking and German still use their bundled rotations. This pipeline currently covers English reading. It adds no accounts, public owner-funded AI endpoint or editorial dashboard. Existing PostgreSQL/Prisma and server API code remain intact.
