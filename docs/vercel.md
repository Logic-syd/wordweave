# Vercel 免费预览

计划上线商业产品或增加站方收费模式时，优先看 [Netlify 上线说明](netlify.md)。这里的 Hobby 流程仅用于符合其个人非商业条款的项目；暂时不收费并不自动等于非商业用途。

当前公开版无需数据库，用户在浏览器保存学习记录、填写自己的 API 并直接调用供应商。个人非商业预览优先使用 Vercel Hobby 免费方案；适用条款与用量以 [Vercel 当前方案](https://vercel.com/docs/plans/hobby) 和账户控制台为准，不代表不限量或模型 API 免费。

## 最短操作

1. 打开 https://vercel.com/new ，用 GitHub 登录。
2. 找到 `Logic-syd/wordweave`，点击 **Import**。
3. 保持根目录 `./`、Next.js 框架，**环境变量留空**，点击 **Deploy**。

仓库 `vercel.json` 已设置安装和构建命令。不要选 `workbench/` 或 `extension/` 作为根目录，不要添加 PostgreSQL，不要复制 Railway 的模型 Key、密码或数据库地址。不需要设置 `npm start`，也不需要运行数据库迁移。

Prisma Client 生成只用于编译保留的旧接口，不会连接或创建数据库。网站代付 AI 接口通过 `SERVER_AI_ENABLED=false` 关闭。用户在网页右上角「更多功能 → 我的 API」配置自己的服务，免费范文与浏览器朗读无需 Key。

## 部署后验证

- `https://<项目域名>/listen`：直接进入听力练习。
- `/speak`：直接进入跟读内容。
- `/read`：语境阅读，中文正文嵌入英文表达／德语词，原文对照、词卡和收藏。
- `/`：与 `/read` 相同，恢复语境文章和阅读位置。
- `/speak/practice`：从口语页更多菜单进入复述与录音练习。
- `/api/health`：未配置数据库时返回 `{"status":"ok","storage":"browser"}`。

配置自己的 API 后先用一小段材料测试。供应商必须允许浏览器跨域请求（CORS），否则页面会报错，不使用站主 Key 代付。Vercel 免费托管不会免除个人 API 账户费用。

从旧 Railway 域名换到 Vercel 后，旧域名的浏览器记录不会自动带过来；原 PostgreSQL 数据也不会迁移到公开版。保留原数据库与备份，不要为重新上线删除旧数据。

## 部署记录

| 项目 | 当前记录 |
| --- | --- |
| 仓库 | https://github.com/Logic-syd/wordweave |
| 分支 | `main` |
| Vercel 项目 / 域名 | 尚未创建或连接；部署成功后在此记录实际链接 |
| 配置验证 | 本地以空 `DATABASE_URL` / `LLM_*` 执行 Prisma 生成、生产构建和启动；`/`、`/listen`、`/speak`、`/read`、`/settings` 与健康检查通过，不等于已经部署到 Vercel |
| Railway 原项目 | 见 [Railway 记录](railway.md)，用户截图确认试用到期、服务离线 |
| 用户提供的旧独立跟读页 | https://wordweave-study.loftygleam33.chatgpt.site/#exercise |

旧独立跟读页地址由用户于 2026-11-19 提供，对应「文章收件箱 / 开始跟读 / AI 标注重点词」截图。源码来自 `reading` 分支的 `e2f5e3a`，已恢复到主分支 `reading/`，现用于 `/speak` 口语入口；首页和 `/read` 属于原语境阅读。此前把跟读当作阅读入口的映射有误，现已纠正。本次 GitHub 推送和 Vercel 部署不会更新旧域名；当前环境无法打开该域名，未验证其在线构建版本。旧站文章可通过导出 JSON 后导入新站恢复。

## English

For a personal, non-commercial preview, import `Logic-syd/wordweave` at https://vercel.com/new using the Hobby plan. Keep the repository root and Next.js preset, leave environment variables empty, and deploy. The committed `vercel.json` runs `npm ci` and `npm run db:generate && npm run build:web`; no PostgreSQL, migration, owner API key, or `npm start` command is required. Prisma generation is a compilation step, not a database connection.

Hobby eligibility and usage limits follow Vercel's current terms. Users pay their own API provider, configure keys in the browser, and need a provider that supports browser CORS. Existing Railway database and browser records are not migrated. Record the actual project URL here after deployment; local build verification is not a claim that a hosted deployment exists.
