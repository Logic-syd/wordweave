# 语境 · Wordweave

给中文母语者的个人语言学习阅读器。两个入口：把英文技术文章变成中文与英文表达结合的学习材料；在中文故事中学习少量德语词，并对照自然德语全文。

第一版已有完整数据库、真实模型调用和两篇免 API 演示。没有注册、社交或付费功能。

## 本地启动

需要 Node.js 22.12+（推荐仓库固定的 Node 24）、npm，以及带 Compose 的 Docker。默认数据库只监听本机。

```bash
npm run setup
npm run local
```

`setup` 在 `.env` 不存在时复制 `.env.example`，执行锁定依赖安装、Prisma Client 生成、启动 PostgreSQL 17、应用已提交迁移并写入两篇演示。重复执行不会清空文章、收藏或学习记录。删除演示后重新运行 seed 会重新添加演示。

浏览器打开 `http://localhost:3000`。再次启动只需 `npm run local`。数据库已运行时也可以直接 `npm run dev`。

生产方式：

```bash
npm run build
npm run start
```

### 已有 PostgreSQL

在 `.env` 或进程环境设置 `DATABASE_URL`，然后：

```bash
START_LOCAL_DB=0 npm run setup
npm run dev
```

迁移用 `npm run db:migrate`（`prisma migrate deploy`），演示用 `npm run db:seed`。`npm run db:check` 可检查连接；加 `-- --schema` 检查文章表，诊断不显示账号密码。`npm run start` 在启动前自动检查连接及文章表，失败会给出错误提示并退出。修改 schema 后可用 `npx prisma migrate dev --name <说明>` 创建新迁移；不要在有个人数据的库上执行 reset。Prisma 7 使用官方 `@prisma/adapter-pg`；连接 URL 统一在 `prisma.config.ts` 与服务端进程环境读取。

本地 PostgreSQL 数据在忽略提交的 仓库外的 `../.wordweave/postgres`（可用 `WORDWEAVE_DATA_DIR` 覆盖），停止容器或 `docker compose down` 后仍保留。不要删除此目录。Docker 会将数据目录设置为 PostgreSQL 用户所有，这是正常行为。数据库目录位于源码树之外，避免数据库写入触发开发服务器热刷新。

备份／恢复（恢复会替换目标数据库，请先备份）：

```bash
docker compose exec -T db pg_dump -Fc -U wordweave wordweave > backup.dump
# 恢复到已启动的本地库：
docker compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges -U wordweave -d wordweave < backup.dump
```

远程长期使用建议连接持久 PostgreSQL。开发环境快照与应用数据备份是不同的事；不要依赖运行中的容器进程跨任务存活。

## Railway 首次部署

首次部署需要在 Railway 的应用服务 Settings 中明确填写构建、预部署迁移、启动命令和健康检查，具体值及变量填写见 [Railway 部署说明](docs/railway.md)。Railway 新服务已不再启用旧的 `railway.json` 配置，不能仅凭仓库包含该文件就认为迁移会自动运行。这个项目由一个 Next.js 全栈服务和独立 PostgreSQL 数据库组成，页面与后端接口在同一应用内分层实现。

## 启用真实生成

三项均为**服务端**变量，在 `.env` 或托管环境的安全变量设置中填写：

```dotenv
LLM_API_KEY=""
LLM_BASE_URL=""
LLM_MODEL=""
```

`LLM_BASE_URL` 是兼容 OpenAI 的 HTTPS API 根路径，通常以 `/v1` 结尾；服务端向其 `/chat/completions` 发送请求。`LLM_MODEL` 使用供应商当前提供、支持 JSON 对象响应的模型名称，没有内置默认模型。仅为本机测试允许 localhost HTTP。

变量修改后重启应用；生产构建页面在请求时读取配置。密钥不要使用 `NEXT_PUBLIC_` 前缀，不要提交 `.env`，不要在正文或聊天中粘贴密钥。受限网络环境需放行模型服务的实际主机名；代理注入的凭据必须通过其绑定的 HTTPS 目标使用。程序不会将 API Key 发送到浏览器或保存到文章。

不配置模型时可以完整使用 React 状态更新、超市购物两篇演示：阅读、逐段原文、收藏、生词本、词卡、语音尝试和进度保存都使用真实数据库。可以导入并阅读新文章原文；页面会说明学习版生成需要 API，不会用固定模板代替生成。

### 使用 DeepSeek

项目已支持 OpenAI 兼容接口，无需改业务代码。在本机 `.env` 中设置：

```dotenv
LLM_API_KEY=""
LLM_BASE_URL="https://api.deepseek.com/v1"
LLM_MODEL=""
```

将 `LLM_API_KEY` 填成你在 DeepSeek 开放平台创建的 API Key，将 `LLM_MODEL` 填成该平台当前可用、支持 JSON 输出的准确模型 ID。不要直接照抄翻译插件显示的模型名称。保存后重启服务，先用一小段英文测试。

本机启动：`npm run setup`，然后 `npm run local`。已经安装并初始化过时直接运行 `npm run local` 即可。

在当前受限云环境中，需在环境设置中填写 `LLM_API_KEY` 和 `LLM_MODEL`，并允许访问 `api.deepseek.com`。使用平台注入的密钥时，保留平台代理与 CA 配置；Node 24 服务应以 `NODE_USE_ENV_PROXY=1 npm run local` 启动，生产服务则使用 `NODE_USE_ENV_PROXY=1 npm run start`。这些设置不会跳过 TLS 校验。密钥不要发到聊天里。

## 可用的学习闭环

- **技术英语**：粘贴或上传 UTF-8 TXT / Markdown，保存标题与可选来源链接。整篇原文保留；学习版与原文按稳定段落 ID 对齐。标题、列表、链接、引用、行内代码与围栏代码可阅读，代码不发送给模型。每段可展开原文；少／中／多英文保留量需明确点击重新生成才生效。
- **德语**：A1 / A2 / B1、3–5 或 5–8 分钟目标、3 / 5 / 8 个新词、内置／自定义主题、指定词，支持导入德语原文。原创标记为“生成短文”，导入标记为改写。中文嵌词与完整德语逐段对应。名词冠词／复数、动词原形／当前形式、短语说明和可展开基础语法都在词卡中。
- **阅读**：三种释义模式；已认识词默认隐藏释义但仍可点击。手机底部词卡、桌面浮层；切换全文视图尽量保持当前段落位置。自动保存段落、视图、释义模式与读完状态；两种语言的默认偏好分开保存。
- **学习记录**：收藏新词会加入待复习；“想学”可立即复习；主动选“认识”后间隔为 1、3、7、14、30 天；“暂不学习”暂停。阅读完成不算掌握。每个成功版本对同一词只计一次文章接触，复习确认另计。
- **跨篇复习**：优先取最早到期的最多 3 个德语词，带入新的合理情境；只复习时不加新词，无待复习词有明确提示。新词数严格校验，复习未覆盖项明确展示且不计入出现记录。
- **生词本**：按语言、状态、收藏筛选与搜索，查看实际出现的文章和原句。删文章只删除版本／出现关联／阅读位置，词条与用户主动保存的学习记录继续保留。

## 生成与数据约束

核心数据为 `Article`、`ArticleVersion`、`Paragraph`、`VocabularyItem`、`Occurrence`、`UserVocabulary`、`ReadingProgress`、`LanguagePreference`。词条原形与当前出现形式分开；每次出现还保存对应的词形、语法说明与例句，复习词不会沿用旧文章的变位说明；规范化语言／原形／词性／语境义项构成词条键，不会仅凭大小写或词面把所有义项合并。模型可能对同一义项使用不同释义，仍可能产生需要人工判断的近似词条。

`src/lib/repository.ts` 集中读写用户数据，`userScope()` 固定为个人身份，不从请求接受用户 ID。后续账户隔离可替换为经验证的会话身份。

处理顺序是：Markdown 解析和代码／链接保护 → 获取已有词与复习目标 → 生成 JSON → Zod 校验、段落／保护标记／目标覆盖校验 → 事务保存成功版本并更新活动版本。技术正文以约 5,000 字符的段落组分块，不截断段落；输入总上限 40,000 字符。德语导入保持整篇上下文；过长或模型输出不足会明确失败并保留输入。

重复导入请求用幂等键合并，同一篇生成有数据库锁。单次模型请求 90 秒，总生成预算 4 分钟；JSON 输出、段落结构与覆盖失败各有有限重试。任务超过 10 分钟的遗留锁可由下一次明确重试接管。失败不会覆盖成功版本。生成是应用服务进程内任务；进程退出可能中断，页面可重试，并非持久任务队列。

原文与模型内容按文本／Markdown 安全渲染，不接受模型 HTML；原始 HTML 不执行。模型只接收受约束的数据和提示，不具备系统工具。提示词要求忽略文章中的任务修改指令，但结构验证不能证明事实、译文或语言语法全部正确；可对照原文并重新生成。阅读时长也是目标值，不是保证。

个人版没有登录保护。请在本机或有访问控制的个人托管环境使用，不要将数据接口无保护地公开给所有人。

## 验证与开发

```bash
npm run typecheck
npm run lint
npm run test:unit    # 不连接数据库
npm test             # 包含真实 PostgreSQL 的事务／生成集成测试
npm run build
npm run start         # 在另一个终端保持运行
npm run test:e2e       # Chromium 浏览器验收，默认 http://127.0.0.1:3000
```

浏览器测试默认用 `/usr/bin/chromium`；其他路径设 `CHROMIUM_PATH`。若本机没有 Chromium，可 `npx playwright install chromium`，并将 `CHROMIUM_PATH` 指向安装的二进制。可用 `E2E_BASE_URL` 指定运行中的应用。

集成测试使用独立的测试用户范围；浏览器测试会临时操作演示词和进度并在结束时恢复。推荐为测试使用单独数据库。模型传输在集成测试中被明确模拟，以稳定验证代码保护、非法输出、API 失败、并发锁、实际覆盖和失败时保留旧版本；不代表已验证某家真实模型的语言质量。演示阅读与数据库持久化使用真实服务。

目录：`src/components` 是交互阅读界面，`src/lib/markdown.ts` 保护 Markdown，`generation.ts` 处理模型与覆盖，`repository.ts` 封装持久化，`review.ts` 负责调度，`prisma/` 包含 schema、迁移、演示初始化。
