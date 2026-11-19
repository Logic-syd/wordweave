# Read Along · 阅读与跟读工作台

[中文](#中文) · [English](#english)

## 中文

轻量、独立的阅读与逐句跟读工具。导入自己想读的文章，听一句、跟一句，按需查看少量重点词的中文释义。

### 功能

- 粘贴正文、原文链接或整条推荐；有多个链接时先选一篇。支持公开 Guardian / Cup of Jo 页面正文提取、TXT / Markdown 导入和 JSON 文章备份恢复。提取失败会保留输入。
- 紧凑工具栏提供上一句、开始/停止、下一句和语速；声音、留白时长和练习模式收在「播放设置」。支持留白跟读、连续听读与单句循环。
- 当前句自动滚到正文可视区中间。文章开头、结尾停在自然边界，超长句从顶部显示。切换句子和恢复阅读位置同样生效；滚动仅发生在正文区域。
- AI 按整篇精选 3–5 个难词或自然词组，点击原文标记查看中文语境义。简单或很短的文章可以少于 3 个。另有可选的分段整理和全文中文参考。
- 跟读使用设备语音，无需模型；AI 功能需要服务端 API 配置。当前提供即时播放，不导出音频。

### 学习语言与扩展方向

项目面向**英语和德语学习**，以后可逐步扩展到更多语言，各工具保持独立入口。

当前 Read Along 主页的语音筛选、自动分句与 AI 请求仍按英语配置，尚未提供德语切换。保留的兼容工作台 `/workspace.html` 支持英语、德语材料与练习。多语言是后续方向，不能把现有英语设置直接视为通用支持。

后续可为文章保存语言代码，统一按语言选择分句规则、设备语音、AI 提示和词汇信息；德语词汇应考虑名词冠词、复数及动词形式。新增语言应通过独立配置扩展，并保持旧文章和阅读位置兼容。写作练习暂不纳入本工具。

### 本地运行

需要 Node.js 24.10 或更新版本。使用 Node 内置模块，无需安装依赖。在本目录运行：

```bash
npm run dev
```

打开 <http://127.0.0.1:3001>。本地服务只监听回环地址。

```bash
npm test       # 批改、存储与相关回归检查
npm run build # 生成 Worker 构建产物
```

### 可选 AI 配置

在本目录创建被 Git 忽略的 `.env.local`，设置自己的 `OPENAI_API_KEY`，然后重启服务。默认模型为 `gpt-4.1-mini`；可用 `OPENAI_MODEL` 指定支持 Responses API 结构化输出的模型。密钥仅由服务端使用，不写入文章、浏览器学习记录或仓库。不要提交真实密钥。

### 数据与部署

阅读主页的文章、重点词和当前句位置保存在当前浏览器。清理网站数据会删除这些本地记录，可用「导出文章备份」备份并重新导入 JSON。已有服务端材料可恢复到文章列表；浏览器数据不会自动跨设备同步。

兼容工作台本地数据保存在 `.wordweave/study.sqlite`，包括材料、标记和答案。`web/` 存放界面，`server/ai.mjs` 处理模型调用，`worker.mjs` 处理托管身份与数据。托管使用 Cloudflare D1 的 `DB` 绑定及 `drizzle/` 迁移。

部署到 Sites 时应配置自己项目的 `.openai/hosting.json`、D1 绑定及服务端密钥。个人工作台保持仅所有者可访问。本地预览使用固定的本机身份；外网部署必须由可信网关验证身份并覆盖身份头。公开源码应排除个人站点配置、密钥、数据库、学习材料与构建产物。

## English

A small, standalone reading and shadowing tool. Bring an article you want to read, listen and repeat sentence by sentence, and look up a few useful expressions in context.

### Features

- Paste article text, a source URL, or a whole recommendation. Choose an article when several links are found. Import public Guardian / Cup of Jo articles, TXT / Markdown files, or JSON article backups. Failed extraction keeps your input intact.
- A compact toolbar offers previous/next sentence, start/stop, and speed. Voice, practice mode, and repeat pauses live under playback settings. Modes include shadowing with pauses, continuous listening, and sentence looping.
- The active sentence automatically moves to the middle of the visible reading area. Scrolling stops naturally at the beginning and end; oversized sentences align at the top. This also works when selecting sentences or restoring a saved position. Only the article pane scrolls.
- Optional AI selects 3–5 difficult words or useful phrases per article. Tap a marked expression for its Chinese meaning in context. Short or simple articles may need fewer terms. Paragraph cleanup and a Chinese reference translation are also available.
- Playback uses your device's speech voices and needs no model. AI features require server-side API configuration. Audio plays immediately; audio-file export is not provided.

### Learning languages and future expansion

The project is intended for **English and German learning**, with room for more languages later. Tools retain separate entry points.

The current Read Along homepage still uses English voice filtering, sentence segmentation, and AI request settings; it does not yet offer a German switch. The retained compatibility workbench at `/workspace.html` supports English and German materials and exercises. Broader language support is planned, rather than already implemented in this reading interface.

Future work can store a language code per article and select segmentation, device voices, AI prompts, and vocabulary metadata through language-specific configuration. German vocabulary should account for noun articles, plurals, and verb forms. New languages should preserve existing articles and reading positions. Writing practice is outside this tool's current scope.

### Run locally

Use Node.js 24.10 or later. No dependency installation is required; the project uses built-in Node modules. From this directory, run:

```bash
npm run dev
```

Open <http://127.0.0.1:3001>. The local server listens only on the loopback address.

```bash
npm test       # Grading, persistence, and related regression checks
npm run build # Build the Worker
```

### Optional AI configuration

Create a Git-ignored `.env.local` in this directory, set your own `OPENAI_API_KEY`, and restart the server. The default model is `gpt-4.1-mini`. Set `OPENAI_MODEL` to use another model supporting structured output through the Responses API. The key stays on the server and is not stored in articles, browser learning records, or the repository. Never commit a real key.

### Data and deployment

The reading homepage stores articles, vocabulary, and the selected sentence in the current browser. Clearing site data removes these local records. Use the article-backup export and JSON import to back them up and restore them. Existing server materials can be restored into the article list; browser data does not automatically sync across devices.

The compatibility workbench stores local materials, annotations, and answers in `.wordweave/study.sqlite`. UI files live in `web/`, model calls in `server/ai.mjs`, and hosted identity/data handling in `worker.mjs`. Hosted storage uses a Cloudflare D1 `DB` binding and migrations in `drizzle/`.

For Sites deployment, configure your own `.openai/hosting.json`, D1 binding, and server-side secret. Keep a personal workbench owner-only. Local preview uses a fixed local identity; an internet-facing deployment needs a trusted gateway that authenticates users and overwrites identity headers. Public source exports should exclude personal hosting configuration, secrets, databases, learning materials, and build output.
