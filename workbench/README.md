# 语境听说工作台 · Wordweave Listening & Speaking Workbench

[简体中文](#简体中文) | [English](#english)

## 简体中文

「语境 · Wordweave」的个人听说练习工具，与[阅读器](../README.md#简体中文)、[英文翻译插件](../extension/README.md#简体中文)同仓库维护，独立运行。面向中文使用者，练习工作英语与 A1–B1 德语；学习材料、记录与复习暂不与另外两个工具同步。

> 主网站现在提供公开的 `/listen`、`/speak`、`/read`，无需注册，每人自行配置 API，浏览器直连供应商并保存共用单词库。请优先在根目录运行 `npm run dev`。以下仅描述保留的独立旧工作台，其服务端 Key、SQLite 和旧浏览器记录不自动迁入公开版，也不要将它当作公开 BYOK 服务部署。

### 启动

需要 **Node.js 24.10+**，使用内置 SQLite，无需安装依赖或启动 PostgreSQL。在仓库根目录运行：

```bash
npm run workbench:dev
```

打开 <http://127.0.0.1:3001>。也可以进入 `workbench/` 后运行 `npm run dev`。本地服务仅监听回环地址，使用固定的本机身份。数据保存在 `workbench/.wordweave/study.sqlite`，浏览器另存离线草稿；重启不会清空记录。

### 练习内容

- 内置 15 份英德材料，无 Key 也能阅读、朗读、听写、自评、做笔记和复习。
- 5 分钟模式听一段并概括重点；20 分钟模式依次完成理解、跟读、听写、复述、口语回答。
- 导入自己的材料后，点击「生成中文与练习」调用模型，按原段落生成中文辅助、理解题和口语题。
- 提交文字回答后，模型按意思要点批改，给出建议与参考说法；答案与反馈保存在「练习记录」，可以对旧答案补批。
- 听写在浏览器逐词比对，无需模型。朗读使用浏览器 `speechSynthesis` 和系统语音。可以保存跟读笔记、录音或视频链接，**目前不会上传录音、语音识别或评价发音**。

### 独立旧工作台的服务端配置

独立旧工作台使用 OpenAI 兼容的 **Chat Completions** 服务端接口。以下变量只适用于这个旧工具；公开网站改为用户在浏览器填写自己的 API：

```dotenv
LLM_API_KEY=""
LLM_BASE_URL="https://api.deepseek.com/v1"
LLM_MODEL=""
```

填入自己的 Key 和供应商当前提供、支持 JSON 对象输出的准确模型 ID，然后重启。没有硬编码默认模型。使用 OpenAI 或其他兼容服务时，替换 Base URL、Key 和模型即可；请求发往 `${LLM_BASE_URL}/chat/completions`。

本地配置优先级从高到低：**进程环境 → `workbench/.env.local` → `workbench/.env` → 根目录 `.env.local` → 根目录 `.env`**。在同仓库使用时，无需复制第二份 Key。若将工作台单独复制到别处，可将本目录的 [.env.example](.env.example) 复制为 `.env.local` 后填写；不要用空值覆盖已有共享配置。

从旧版迁移：把 `OPENAI_API_KEY` 改为 `LLM_API_KEY`，把 `OPENAI_MODEL` 改为 `LLM_MODEL`，并明确设置 `LLM_BASE_URL`。旧版 OpenAI 服务可填 `https://api.openai.com/v1`。旧变量不再读取，已有材料与批改记录继续有效。

同阅读器，支持 `LLM_THINKING=auto|enabled|disabled`；`auto` 仅对官方 DeepSeek 关闭深度思考。`LLM_MAX_OUTPUT_TOKENS` 默认 8192，`LLM_MAX_RESPONSE_BYTES` 默认 1048576。模型输出必须通过结构与段落顺序校验；超时、无效输出或服务故障会显示错误并允许手动重试，不自动改用另一家服务。

Key 只在服务端使用，不写入前端构建或练习记录。AI 请求发送必要的原文、题目与文字答案，不发送录音链接。相同输入的成功结果按用户、服务地址、模型和思考设置缓存；重复点击不会为同一正在处理的请求再调用模型。工作台与阅读器共用 Key 时会消耗同一供应商账户的余额，但**不共用阅读器的数据库、登录或 `GENERATION_*` 每日限额**。插件仍由使用者自行填写 Key。

### 验证与部署

在仓库根目录运行：

```bash
npm run workbench:test
npm run workbench:build
```

工作台测试使用内存 SQLite 和明确模拟的模型响应，覆盖批改缓存、用户隔离、段落对应、API 配置、错误重试及旧记录兼容；不代表供应商的真实语言质量。构建生成 `workbench/dist/server/index.js`，不打包浏览器插件，也不部署服务。

`web/` 是界面，`server/ai.mjs` 调用模型，`worker.mjs` 处理身份与数据。Worker 托管需要 Cloudflare D1 的 `DB` 绑定、`drizzle/` 迁移、静态资源构建及服务端 `LLM_*` 变量。若使用 Sites，另按自己的环境设置 `.openai/hosting.json`；仓库不包含可直接发布到任意账户的托管配置。

独立工作台不是 Next.js 服务的一部分；新版网站自己的 `/listen` 和 `/speak` 页面随网站一起部署。独立工作台仍需单独托管。工作台的托管身份来自可信网关写入的 `oai-authenticated-user-id`；独立对外部署必须由网关验证身份、覆盖外部传入的同名头，并将个人工作台限制为所有者访问。不能把本地预览直接当成已具备个人登录的生产服务。

## English

The personal listening and speaking tool in **语境 · Wordweave**, maintained in the same repository as the [reader](../README.md#english) and [English translation extension](../extension/README.md#english). It runs independently and helps Chinese speakers practice workplace English and A1–B1 German. Materials, practice history, and reviews are not synchronized with the other tools.

> The main website now provides public `/listen`, `/speak`, and `/read` pages with no registration: user-supplied API keys, direct browser requests and a shared browser-local vocabulary. Prefer `npm run dev` at the repository root. The instructions below describe the retained legacy standalone app. Its server key, SQLite and browser records are not automatically migrated; it is not the public BYOK service.

### Run locally

Requires **Node.js 24.10+**. It uses built-in SQLite, with no dependency installation or PostgreSQL required. From the repository root:

```bash
npm run workbench:dev
```

Open <http://127.0.0.1:3001>. Alternatively, run `npm run dev` inside `workbench/`. The local server only listens on loopback and uses a fixed local identity. Data is stored in `workbench/.wordweave/study.sqlite`, with offline drafts also kept in the browser. Restarting preserves records.

### Practice

- Includes 15 English/German samples. Reading, browser playback, dictation, self-assessment, notes, and review work without an API key.
- Five-minute sessions focus on listening and summarizing; twenty-minute sessions cover comprehension, shadowing, dictation, retelling, and a spoken response.
- Import your own text and select **Generate Chinese and exercises** (`生成中文与练习`) to request aligned Chinese support, comprehension questions, and speaking prompts.
- The model grades written answers against meaning points, with suggestions and example responses. Answers and feedback are saved in practice history; older answers can also be graded.
- Dictation is checked word by word in the browser without a model. Playback uses browser `speechSynthesis` and system voices. Notes and recording/video links can be saved, but **recordings are not uploaded, transcribed, or scored for pronunciation**.

### Legacy standalone server configuration

The legacy standalone workbench uses an OpenAI-compatible **Chat Completions** server endpoint. These variables apply only to this old tool; the public website now uses browser-configured BYOK:

```dotenv
LLM_API_KEY=""
LLM_BASE_URL="https://api.deepseek.com/v1"
LLM_MODEL=""
```

Supply your key and the exact model ID currently offered by your provider with JSON-object output support, then restart. There is no hardcoded default model. For OpenAI or another compatible service, change the Base URL, key, and model. Requests go to `${LLM_BASE_URL}/chat/completions`.

Local precedence, highest first: **process environment → `workbench/.env.local` → `workbench/.env` → root `.env.local` → root `.env`**. No second copy of the key is needed in this repository. For a standalone copy, copy this directory's [.env.example](.env.example) to `.env.local` and fill it in. Blank local values override shared settings, so do not add them when inheriting a configuration.

Migrating from the earlier workbench: rename `OPENAI_API_KEY` to `LLM_API_KEY` and `OPENAI_MODEL` to `LLM_MODEL`, then explicitly set `LLM_BASE_URL`. For OpenAI, use `https://api.openai.com/v1`. The old variable names are no longer read. Existing materials and grading history remain valid.

As in the reader, `LLM_THINKING=auto|enabled|disabled` is supported; `auto` disables thinking only for the official DeepSeek host. `LLM_MAX_OUTPUT_TOKENS` defaults to 8192 and `LLM_MAX_RESPONSE_BYTES` to 1048576. Model output is checked for structure and paragraph order. Timeouts, invalid output, and provider failures allow manual retry without silently switching providers.

The key stays on the server and is not included in frontend assets or practice records. AI requests include only the relevant source text, question, and written answer, not recording links. Successful responses are cached by owner, endpoint, model, thinking settings, and input; duplicate in-flight requests do not trigger another model call. Sharing a key uses the same provider account balance, but **the workbench does not share the reader's database, authentication, or `GENERATION_*` daily limits**. Extension users still supply their own keys.

### Verification and deployment

From the repository root:

```bash
npm run workbench:test
npm run workbench:build
```

Tests use in-memory SQLite and explicit provider fixtures to check grading caches, owner isolation, paragraph alignment, configuration, retry behavior, and legacy records. They do not establish live language quality. The build produces `workbench/dist/server/index.js`; it neither packages the browser extension nor deploys a service.

`web/` contains the UI, `server/ai.mjs` calls the model, and `worker.mjs` handles identity and data. Worker hosting requires a Cloudflare D1 `DB` binding, the `drizzle/` migrations, the asset build, and server-side `LLM_*` variables. Sites hosting additionally needs your own `.openai/hosting.json`; this repository does not include a deployment configuration ready for every account.

This standalone app is separate from Next.js; the integrated website’s `/listen` and `/speak` pages deploy with the website. Hosting this standalone app still requires a separate service. Hosted identity comes from a trusted gateway's `oai-authenticated-user-id` header. An external deployment must authenticate the owner, overwrite incoming identity headers, and restrict access to the owner. The loopback preview is not a production service with the reader's personal login built in.
