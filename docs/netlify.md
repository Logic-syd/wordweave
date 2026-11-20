# Netlify 上线

当前路线：先公开提供基础版和用户自带 API 的增强功能，未来增加站方提供额度的付费模式。首页直接进入语境阅读；`reading` 分支恢复的 Read Along 界面用于口语入口。不增加首次进入时的套餐选择。

## 第一次部署

1. 打开 https://app.netlify.com/start ，使用 GitHub 登录。
2. 选择导入现有 Git 仓库，授权访问并选择 `Logic-syd/wordweave`。
3. 分支选择 `main`，基础目录保持仓库根目录（留空或 `.`）。环境变量留空。
4. 点击部署。`netlify.toml` 已提供构建命令和发布目录。
5. 部署成功后，在项目概览或域名设置里复制实际的 `https://….netlify.app` 地址。首页是语境阅读，右上角「口语」打开原版文章收件箱和逐句跟读。

如果控制台需要手填，构建命令为 `npm run db:generate && npm run build:web`，发布目录为 `.next`。Netlify 会自动使用官方 Next.js Runtime，不需要单独选择 `reading/`、手动上传 HTML 或配置启动命令。公开版不需要 PostgreSQL 或站主模型 Key。

Netlify 提供免费方案，适用于额度内试运行；免费额度、适用条款与超额处理以 [当前方案](https://www.netlify.com/pricing/) 和账户控制台为准。这里没有核实或承诺具体的最新额度。Vercel Hobby 限个人非商业用途，不能只根据“用户暂时不付钱”判断一个商业产品是否适用。

## 基础版、自带 API 和未来付费版

| 模式 | 体验 | 谁支付模型费用 | 当前状态 |
| --- | --- | --- | --- |
| 基础版 | 导入正文、自动分句、设备朗读、跟读、听写、收藏和本机记录；选词免费查义 | 不调用大模型 | 已实现 |
| 自带 API | 自己填写 Key，主动使用全文中文参考、学习内容生成和文字反馈 | 使用者向自己的模型供应商付费 | 已实现；供应商需允许浏览器跨域请求 |
| 站方付费模式 | 购买站方提供的额度，免去个人 API 配置 | 站方计费并承担供应商调用费用 | 尚未实现 |

用户第一次打开直接学习；右上角「我的 API」作为可选增强设置。现在不要求注册。免费查义依赖第三方网络服务，设备朗读依赖本机可用语音，两者都不代表完全离线或不限量。

付费模式需要另行实现账户身份、订单与支付回调、服务端额度账本、请求限流和成本上限。站方 Key 只保存在服务端，按已支付额度授权调用；不在浏览器共享 Key，也不以开启旧 `SERVER_AI_ENABLED` 开关代替计费权限。基础版与个人 Key 路径继续保留。

当前没有云同步；换浏览器或域名不会自动带过记录。旧 Read Along 文章可以从旧站导出 JSON，再在新站「导入文件」。

每日精选与本地音频导入均无需新增环境变量或数据库：三个入口按浏览器日期轮换内置内容，用户可选收藏。听力文件只存于该域名的浏览器空间，最大 20 MB；清除站点数据或改域名不会迁移音频。没有自动转写，未提供原文时不评分。

## 部署记录与检查

| 项目 | 记录 |
| --- | --- |
| Git 仓库与分支 | https://github.com/Logic-syd/wordweave · `main` |
| Netlify 项目 / 域名 | `weavie` · https://weavie.netlify.app （用户确认改名，2026-11-20） |
| 之前的 Netlify 域名 | `wordweave-m4zt.netlify.app`，用户已改名；不要继续作为当前入口分享 |
| Git 发布设置 | 用户截图显示 `main` 每次推送自动发布，Pull Request 生成预览 |
| 路由修复 | 跟读曾误占首页与阅读入口。现已恢复 `/`、`/read` 的语境阅读，Read Along 改用 `/speak` 的 Netlify 原生静态路由 |
| 验证范围 | 本地生产构建、浏览器学习流程与独立 Netlify CDN 路由测试；线上部署需另行核验，测试不代表真实模型或设备语音质量 |

Read Along 构建为 `public/read-along/index.html`。Netlify Next.js Runtime 把它放进 CDN 静态目录，未放进 Next.js 函数包。`netlify.toml` 因此只将 `/speak` 以原生 200 rewrite 指向该文件；仅使用 `next.config.ts` 的静态文件 rewrite 会误入函数里的 404。规则精确匹配口语入口；`/`、`/read`、`/read/:id`、`/listen`、`/speak/practice` 与 API 路由继续交给 Next.js，不要把语境阅读再次重写为跟读文件。

`/speak/practice` 保留复述、情景表达、录音和已有练习记录；从口语页右上角更多菜单进入。旧的 `/read?article=…&sentence=…` 跟读链接转到 `/speak`，旧 `/speak?material=…` 或 `?word=…` 练习链接转到 `/speak/practice`。语境文章与跟读材料的存储键、单词 ID 与学习状态保持原样；词库里以前误标为阅读的跟读来源按口语显示。

之前云环境访问 https://weavie.netlify.app 曾受到网络限制（CONNECT 403）。2026-11-20 的界面更新检查已能连接，但匿名请求返回 HTTP 401，并要求转到 Netlify `edge-access` 登录；这是托管平台的访问保护，尚未独立核验匿名用户看到的新版页面。原语境阅读源码和范文一直保留，这次恢复它们的入口。改域名不会迁移浏览器数据；入口修复也不会自动找回另一域名的数据。

本次检查还发现 Next.js 16.4.2 的已知安全公告会中断构建；已将 Next.js 与 `eslint-config-next` 更新到同系列补丁 16.4.6。没有关闭安全提醒或修改用户界面。完整 Netlify CLI 构建的 Edge Functions 打包曾因网络请求失败而未完成，因此不将本地静态路由验证描述为已经验证线上 Edge Functions。

路由回归可在生产构建后运行 `npm exec --yes --package=netlify-cli@27.20.1 -- node tests/netlify-routes.mjs`。测试使用隔离的公开静态文件目录与真正的 Netlify redirect 引擎，校验查询参数和浏览器脚本加载，不涉及用户账户或发布。该静态测试不包含 Next.js 服务端或 Edge Functions，生产鉴权保持原样。可用 `NETLIFY_STATIC_DIR=.netlify/static` 指定实际部署静态产物。

2026-11-20 入口修复验证：生产构建、TypeScript、lint、26 项相关单元测试、9 项 Playwright 测试、`tests/browser-byok.mjs`、`tests/practice.browser.mjs` 和 Netlify 原生静态路由测试通过。覆盖首页语境阅读、三个入口切换、德语视图、收藏来源、代码保护、独立进度、旧链接与自带 Key 流程。浏览器中的模型、翻译接口及语音设备使用测试替身，未消耗真实 API，也不代表真实语言质量验证。

2026-11-20 后续界面更新：阅读采用左侧导入、右侧正文布局，原顶部工具区移入左栏，手机默认折叠；听、说、读改为明显的中英按钮，网站界面文案中英并列。Prisma schema、迁移和服务端 API 保留，公开版仍使用浏览器存储；用户明确选择以后再接数据库。本次生产构建、TypeScript、lint、20 项相关单元测试、11 项 Playwright 测试、自带 Key 流程、听说练习浏览器测试和 Netlify 原生静态路由检查通过。另验证手机错误重试可展开设置、无 Key 侧栏导入保留代码、320px 窄屏导航、收藏与词汇覆盖。

2026-11-20 每日学习与听力导入：三处入口加入按本地日期轮换的精选内容、主动收藏与共用「我的库」；听力统一左栏导入布局，支持本地音频、可选原文、听写或笔记和刷新恢复。24 项相关单元测试、14 项 Playwright 流程、TypeScript、lint、生产构建、听说练习／自带 Key 浏览器回归及 Netlify 静态路由检查通过。音频测试使用可解码的 WAV 测试文件，验证播放、跳转和语速；未验证所有设备或编码格式。没有调用真实付费模型；未连接或迁移 PostgreSQL。匿名线上检查仍返回 HTTP 401，不能据此声称新版已公开可访问。

部署后验证首页和 `/read` 显示语境文章，`/listen` 显示听力，`/speak` 显示跟读，`/speak/practice` 显示复述与录音；词可在 `/vocabulary` 找到，刷新后记录仍在；`/api/health` 应返回 `{"status":"ok","storage":"browser"}`。用隐私窗口检查无 Key 仍能使用基础功能，再在正常窗口以自己的配置测试 AI。

## English

Import `Logic-syd/wordweave` from GitHub at https://app.netlify.com/start. Choose `main`, keep the repository root, leave environment variables empty, and deploy. The committed `netlify.toml` sets `npm run db:generate && npm run build:web`, publishes `.next`, uses Node 24 and disables owner-funded AI. Netlify automatically installs its Next.js Runtime. No database or owner API key is required.

The owner confirmed the renamed address as https://weavie.netlify.app on 2026-11-20. `/` and `/read` are contextual reading, `/listen` is listening, and `/speak` is the restored Read Along speaking workspace. Only `/speak` is rewritten to a static HTML file at the Netlify CDN; all other entries remain Next.js routes. Retelling and recording are retained at `/speak/practice`. Saved article IDs, vocabulary and progress are preserved, with compatibility for old source links. Moving to another domain does not migrate browser storage.

The subsequent interface update adds a left import/settings sidebar, a right contextual article, clear bilingual mode buttons and Chinese/English interface copy. The sidebar starts collapsed on phones. Prisma, migrations and server APIs remain intact; public database integration is deferred at the owner's request. Production build, typecheck, lint, 20 focused unit tests, 11 Playwright tests, BYOK and practice browser flows, and native Netlify static routing checks passed. Live anonymous requests currently return HTTP 401 and redirect to Netlify's access login, so these local checks do not establish that the hosted update is publicly accessible.

The current product offers free core learning and optional bring-your-own-key AI in the same interface. A future paid, provider-managed allowance is planned but not implemented. It requires account identity, payments, server-side quotas and cost controls; provider keys must remain on the server. No signup or plan selection is introduced for the current public version.

Check Netlify's current plan terms, usage allowances and overage behavior in its dashboard; no exact current quota has been verified here. Vercel Hobby is limited to personal, non-commercial use, which is not determined solely by whether the site currently charges users. Record the actual Netlify project/domain after deployment. A verified local production build is not a claim that the hosted site is already online.

Daily picks and local listening imports need no new environment variables or database. Each entry rotates bundled content by browser-local date with optional saving. Audio files (up to 20 MB) stay in this origin’s browser storage and are excluded from JSON exports. No transcript means no automatic grade; speech transcription is not implemented.

Validation for daily lessons and listening imports: 24 focused unit tests, 14 Playwright flows, typecheck, lint, production build, existing practice/BYOK browser checks and native Netlify static routing passed. Audio playback used a decodable WAV fixture; coverage does not establish support for every device or codec. No paid model calls or PostgreSQL migration were performed. Anonymous hosted access still returns HTTP 401.
