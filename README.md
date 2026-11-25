# 语境 · Wordweave

[简体中文](#简体中文) | [English](#english)

## 简体中文

给中文母语者的语言学习工具。**网站公开使用，无需注册；每个人填写自己的 API，文章、词卡和练习记录保存在自己的浏览器。** 网站不代转模型请求，也不使用站主的 Key。

| 入口 | 做什么 | 特点 |
| --- | --- | --- |
| `/listen` 听力 | 每日一题，导入音频、概括重点、听写对照 | 青绿色；左侧导入、右侧练习，默认收起原文 |
| `/speak` 口语 | 原版 Read Along：导入文章、逐句跟读、选词查义；角落可进入复述与录音 | 文章收件箱、淡紫背景、粉色当前句；播放时展开正文 |
| `/`、`/read` 阅读 | 语境阅读：中文正文嵌入英文表达或德语词，原文对照、词卡与收藏 | 安静的文章排版、淡粉强调；直接打开今日文章 |
| `/library` 我的库 | 主动保存的听说读内容，以及语境文章与范文 | 按听、说、读筛选；原文、代码与语境词卡保留 |
| `/vocabulary` 单词库 | 听说读共用收藏、认识状态、出现句子 | 词条可直接拿去听或说 |
| `/settings` 我的 API | 设置自己的服务、模型与 Key，导出记录 | 保存配置不发请求；测试连接会消耗少量额度 |

线上地址：<https://weavie.netlify.app/>（用户于 2026-11-20 确认改名）。首页和 `/read` 直接打开今日语境阅读。`/speak` 使用从 `reading` 分支恢复的原版「文章收件箱＋逐句跟读」，默认打开今日短文；已保存的文章链接恢复当前句。复述、情景表达、录音保留在 `/speak/practice`，从口语页右上角更多菜单进入。`/listen` 是独立听力练习，三个入口互相切换。跟读选词免费查义，可选的全文中文参考使用自己的 Key。[跟读说明](reading/README.md)。

三个学习页面可以互相跳转，在**同一浏览器、同一网站地址**下共用单词库。附带 12 篇结构化阅读范文（含 4 篇千词英语长文）与 15 份英德听说材料；范文、浏览器朗读、听写对照、收藏和进度保存无需 Key。范文明确标注为演示内容，不冒充现场生成。

听力与阅读均采用左侧导入、右侧学习的布局，与口语收件箱保持一致。阅读页导入、学习版／原文切换和释义设置集中在左栏，手机默认收起左栏。右上角是明确的阅读／听力／口语切换按钮。公开学习界面的标签、按钮和说明同时显示中文与英文；文章、原文、代码和生成内容按学习内容原样显示。

阅读设置直接显示 **英文保留量：少／中／多**，独立于释义显示方式。八篇英语范文内置三档内容：少档中文更多，中档保留重点表达，多档保留更多完整英文句子；立即切换，不调用 API，并按文章在浏览器保存选择和阅读进度。自己导入的文章先选择程度，再明确点击重新生成，才使用自己的 Key；失败保留已有成功版本。

**后端仍在仓库中**：Prisma schema、PostgreSQL 迁移和服务端 API 均保留。本次只调整界面，不把公开版学习记录改为数据库存储；公开版接入数据库另行实现。

### 每日内容与听力导入

- 直接打开听、说、读，每天分别提供一条听力和问题、一篇口语短文、两篇英语语境长文（德语仍为一篇短文）。基础版从 **15 份听力材料、7 篇口语短文、8 篇阅读范文**按浏览器本地日期轮换，同一天刷新不变，轮完会重复。不是实时生成、新闻抓取或通知推送。阅读默认英语，英语每天选 2 篇，每篇英文正文约 1,300–1,450 词，当前 4 篇长文每两天轮完；正文上方可切换第一篇、第二篇（`/read?part=2`），分别保存与恢复进度。德语按 4 篇短文轮换；点击左栏德语才打开德语今日文章（`/read?lang=de`），明确选择后刷新保留，直接打开 `/read` 仍为英语。
- 点击「保存到我的库」才收藏每日内容，最多 500 条；不收藏也能学，答案、阅读位置和单词状态仍独立保存。从「我的库」的明确链接继续旧内容；直接进三个入口始终打开当日内容。
- 长文是明确标注的 AI 辅助原创练习文章，英文原文与学习版随网站提供，无需 Key；不是转载新闻。日常维护在 `src/lib/daily.ts` 追加口语和阅读选项，英语长文内容在 `src/lib/long-reads/`，听力使用 `src/lib/practice-content.ts`。保留旧 ID 和内容以保证收藏链接可用；更换内容请新增 ID。这版还没有运营发布后台。
- 听力左栏支持 MP3、WAV、M4A、OGG、WebM、AAC、FLAC，单文件最多 **20 MB**，是否可播放取决于浏览器解码能力。文件留在 IndexedDB，刷新可继续使用，不上传服务器或 AI。
- 播放 → 写重点 → 提交 → 重听／看原文核对。支持暂停、拖动进度、前后跳 5 秒和调速。有原文可做听写对照；整段录音使用完整原文，没有时间戳就不假装逐句定位。听写最多 2,000 字符；长原文可练大意。没有原文只能保存笔记，不自动转写、不自动评分；有原文时可主动使用自己的 API 评价文字回答。
- 「保存并开始练习」会把主动导入的听力放进自己的库。JSON 备份**不包含音频文件**，请保留原始音频。收藏移出只取消收藏，不删除导入材料、学习进度或词条。

### 启动网站

需要 Node.js 22.12+（推荐 Node 24）和 npm。公开版无需数据库、Docker 或站主 API 配置：

```bash
npm ci
npm run db:generate
npm run dev
```

打开 <http://localhost:3000>。生产验证：

```bash
npm run build:web
npm start
```

`npm run build` 与 `npm run build:web` 都只构建网站，不会打包插件。插件打包使用独立的 `extension:build` / `extension:release` 命令。已有 `.env` 中若配置了 `DATABASE_URL`，生产启动仍会检查并迁移该旧数据库；未配置则直接启动公开版。[环境示例](.env.example) · [Netlify 上线与付费路线](docs/netlify.md) · [Vercel 非商业预览](docs/vercel.md) · [原 Railway 项目](docs/railway.md)。

### 使用自己的 API

1. 阅读左栏未配置时直接显示 API 表单，也可从「我的 API」进入。选择 GPT / OpenAI、Claude / Anthropic、Grok / xAI、DeepSeek，或自定义兼容接口，填写自己的 Key 和供应商当前支持 JSON 输出的准确模型 ID。没有预选供应商或硬编码默认模型。
2. 保存后原地展开文章导入。默认只在当前标签页会话保存；在「存储与高级设置」勾选记住后才长期保存在本机。保存不会请求模型，只有测试连接、生成和 AI 反馈会调用供应商。
3. 不用 AI 时，点击「只导入原文（免费）」即可保存、阅读原文；免费范文、词卡与学习记录照常使用。

官方地址随服务商自动填写，自定义地址可编辑。Claude 使用原生 `/messages`，其余使用 OpenAI 兼容的 `/chat/completions`；默认对官方 DeepSeek 关闭深度思考。切换服务商或修改自定义地址会清空待保存的 Key，取消修改则保留原配置和文章草稿。保存前说明 Key 的存储位置和发送对象：Key 与待处理文本直接发给所选供应商，不传到语境后端；学习记录导出不含 Key。网站不会从 `LLM_*` 读取备用 Key。

**服务商必须允许网页直接跨域调用（CORS）。** 网络、权限或 CORS 不允许时会明确提示，不走网站代理，也不自动换供应商。HTTPS 网站连接本机模型还受浏览器本地网络权限限制。模型请求仍在供应商服务器执行并可能收费；“本地使用”指配置与学习数据保存在浏览器，不是模型离线运行。建议在供应商账户设置消费上限。不要在共用电脑勾选长期记住 Key。

### 本地数据与学习闭环

- 语境文章、完整词条、听说材料及记录存于 IndexedDB；Read Along 的文章、备份与当前句沿用 `readalong.articles` 本机存储；小型草稿、范文记录、阅读位置与 Key 使用浏览器存储。关闭再打开可恢复，Key 的保留取决于是否勾选记住。
- 不同浏览器、设备和网站域名互不共享数据。清除网站数据会删除本机记录；可在「我的 API」导出不含 Key 的 JSON 备份，这个全站备份不包含音频文件，暂不支持导入，也没有云同步。Read Along 另有「导出文章备份 / 导入文件」，支持恢复旧版跟读文章 JSON。
- 技术英语支持粘贴、UTF-8 TXT / Markdown；保存完整原文、标题与来源。稳定段落 ID 对应学习版，支持逐段查看原文。代码块不交给模型，行内代码与链接保护后恢复；不会抓取来源网址或解析 PDF。
- 德语支持 A1 / A2 / B1、3 / 5 / 8 个新词、自定义主题与指定词、导入原文和只复习。中文嵌词版与自然德语逐段对应；名词冠词复数、动词变化和基础语法在词卡中展示。实际新词数与复习覆盖通过校验后保存。
- 收藏进入待复习；主动选「认识」后间隔 1、3、7、14、30 天；「暂不学习」暂停。出现次数和主动复习分别记录，读完或完成练习不等于掌握。最多挑选 3 个到期德语词用于新文章。
- 手机底部词卡、桌面浮层；三种释义模式、已认识词隐藏释义、阅读位置与语言偏好自动保存。删除文章保留词条和用户主动保存的学习状态，清理文章关联。
- 听说共享文字材料，语速与草稿各自保存。浏览器朗读依赖系统英／德语音包，没有语音时提示。听力导入的音频在本机持久保存；口语录音仍留在当前页面，可下载。不自动转写、不评价发音，AI 评价的是文字回答。
- 浏览器最多保存 200 篇文章、200 份听说材料、最近 1,000 条完整听说记录；界面展示最近 100 条，草稿按任务保留最近 100 份。

### 生成可靠性

模型输出结构化 JSON，经过 Zod、段落对应、代码保护、原句与目标词覆盖校验后才保存。输入按文本安全渲染，文章里的指令不作为系统指令执行。技术长文按段分块、顺序合并，不静默截断。重新生成失败保留原文和已有成功版本。

浏览器每篇最多两个并行块、普通错误最多两次额外重试，每块最多重试一次；整篇限时 4 分钟、单请求 90 秒、输出 8,192 tokens / 1 MiB。生成按钮和浏览器跨标签页锁防止同篇重复生成。费用由使用者账户承担，不设置站主每日额度。供应商可能对失败请求收费。

明确的 `Content Exists Risk`、`content_filter` 或拒绝回复按内容拒绝处理；单纯 400 / 403 或非法 JSON 不是“敏感词”。技术文章被拒绝时按段定位，最多 8 次额外定位调用；成功段落保留，仍被拒绝的段落显示原文并标识，不声称翻译完成。德语保持整篇严格覆盖校验。鉴权、余额、参数不支持直接报错；短暂限流与服务故障有限重试；浏览器网络／CORS 错误不自动重试。语言正确性与所有隐性拒绝无法自动保证。[已有模型故障验证记录](docs/model-failure-checks.md)记载此前的服务端测试，不代表本版完成了真实供应商测试。

### 原有私人数据与独立工具

原 PostgreSQL 数据、迁移、站主鉴权和旧私有接口保留；不会将私人数据库内容公开，也不会自动迁入浏览器。`/login` 仅是站主的旧数据入口。公开页面不依赖它。新部署不需要邀请码或站主密码。

旧服务器生成接口**默认关闭**，即使仍有 `LLM_API_KEY` 也不调用。只有显式设置 `SERVER_AI_ENABLED=true` 才能供已认证站主使用；保留此开关只是兼容旧个人流程，公开页面始终使用自己的 Key。旧 `GENERATION_*` 限额仅适用于这些私有接口。

需要连接旧库时，在服务端配置 `DATABASE_URL`，执行：

```bash
npm run db:generate
npm run db:migrate
npm run db:check -- --schema
```

本机旧数据库可用 `docker compose up -d db` 启动；连接示例 `postgresql://wordweave:wordweave_local@localhost:5432/wordweave?schema=public`。数据目录默认 `../.wordweave/postgres`，不要删除。`npm run setup` / `npm run local` 是保留的 Docker／数据库启动流程；`npm run db:seed` 可补回旧数据库的两篇演示，不是公开范文的必需步骤。不要在已有数据的库上执行 `migrate reset`。

插件 `extension/` 专注**英文网页翻译**，默认免费翻译，AI 用插件用户自己的 Key；不带文章库、不与网站同步、不需要邀请码。开发安装：`npm run extension:dev`，然后 Chrome → `chrome://extensions` → 开发者模式 → 加载 `extension/dist/`。不生成商店 ZIP。详见[插件中英说明](extension/README.md)。

`workbench/` 是保留的独立旧听说工作台（SQLite / D1），不是公开版入口。默认请使用主网站 `/listen` 与 `/speak`；旧工作台仍用自己的服务端配置，不能作为公开 BYOK 版本直接对外部署。[独立工作台说明](workbench/README.md)。

### 验证

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build:web
npm run test:byok:browser
```

浏览器验证使用本机 Chromium（默认 `/usr/bin/chromium`，可设置 `CHROMIUM_PATH`）和明确的模拟模型服务，检查直连自己的 Key、没有站主调用、代码保护、异常重试、本机持久化和浏览器隔离，不消耗真实 API 额度。`npm run test:practice` 验证共用练习结构与旧数据库集成，数据库集成需要 PostgreSQL。测试不证明翻译或发音质量。

## English

A language-learning tool for Chinese speakers. **The website is public, with no registration. Everyone supplies their own API key; articles, vocabulary and practice records stay in their browser.** Model requests go directly to the chosen provider, without a website proxy or an owner-funded fallback.

| Entry | Purpose | Visual identity |
| --- | --- | --- |
| `/listen` | Daily question, local audio import, summaries and dictation | Teal; left inbox, right exercise; transcript initially hidden |
| `/speak` | Original Read Along: import articles, shadow sentences and look up words; retelling/recording in the corner menu | Original inbox, lavender background, pink active sentence; expanded playback |
| `/`, `/read` | Contextual reading: Chinese prose with English expressions or German vocabulary, original text, word cards and favorites | Quiet article layout and soft pink accents; opens today’s article |
| `/library` | Saved listening, speaking and reading, plus contextual articles and samples | Skill filters; preserved source, code and vocabulary cards |
| `/vocabulary` | Shared vocabulary, learning state and source sentences | Reuse words in listening or speaking |
| `/settings` | Your provider, model, API key and data export | Saving does not call a model; connection testing uses a small amount of credit |

Website: <https://weavie.netlify.app/> (rename confirmed by the owner on 2026-11-20). The homepage and `/read` open today’s contextual reading article. `/speak` hosts the original article-inbox and sentence-by-sentence Read Along interface restored from the `reading` branch, with a daily short passage; saved article links restore their sentence. Retelling, situational speaking and recording remain at `/speak/practice`, linked from the speaking page's corner menu. `/listen` remains a separate listening exercise. The three entries link to each other. Word selection in Read Along uses free translation; optional whole-article reference translation uses the learner’s key. See the [Read Along guide](reading/README.md).

All three pages link to one another and share words within the **same browser and website origin**. Twelve structured reading samples (including four English long reads of over 1,000 words each) and fifteen English/German practice materials work without a key. Samples, system-voice playback, dictation comparison, favorites and progress are available for free; samples are explicitly labeled.

Listening and reading both use a left import inbox and a right learning workspace, consistent with the speaking page. Import, learning/original views and gloss settings live in the sidebar, collapsed initially on phones. Clear Read / Listen / Speak buttons switch pages. Public learning controls and instructions display Chinese and English together; article content, source text, code and generated learning content retain their original format.

Reading settings expose **English retention: Low / Medium / High**, separately from gloss visibility. All eight English samples include three versions: more Chinese at Low, key expressions at Medium, and more complete English sentences at High. Switching is instant and makes no API requests; the level and reading progress are saved per article in the browser. Imported articles use the learner's key only after an explicit regeneration click. Failed generation preserves the last successful version.

**The backend remains in the repository**: Prisma schema, PostgreSQL migrations and server APIs are retained. This interface update does not switch public learning records to database storage; connecting the public app to PostgreSQL is a separate future task.

### Daily content and listening imports

- Each entry opens a daily lesson immediately: one listening item with a question, one speaking passage, and two English contextual long reads (one short article in German mode). The free catalog rotates **15 listening materials, 7 speaking passages and 8 reading samples** by browser-local calendar date. It repeats after cycling and does not use AI, scrape news or send notifications. Reading defaults to English, with two 1,300–1,450-word articles per day from a four-article English rotation, repeating every two days. Switch between Article 1 and Article 2 (`/read?part=2`); each has separate bookmarks and progress. German retains a separate four-article rotation. Selecting German opens `/read?lang=de`, which survives refresh; plain `/read` always starts in English.
- Daily lessons enter your library only after **Save to my library** (up to 500 bookmarks). Learning progress and word status are saved independently. Explicit saved links resume older lessons; the three plain entry URLs open today’s content.
- The long reads are labeled AI-assisted original practice texts, bundled with full English originals and learning versions; they require no key and are not republished news. Maintain long-read content in `src/lib/long-reads/` and the catalog in `src/lib/daily.ts` and `src/lib/practice-content.ts`. Preserve existing content IDs and records for saved links; changed content should receive a new ID. There is no editorial publishing dashboard yet.
- The listening inbox accepts MP3, WAV, M4A, OGG, WebM, AAC and FLAC files up to **20 MB**; decoding support varies by browser. Audio stays in IndexedDB and survives reloads. It is not uploaded to the website or an AI provider.
- Play → write notes → submit → replay or compare with the transcript. Controls include pause, seeking, ±5 seconds and speed. Audio dictation compares the entire supplied transcript, with a 2,000-character limit; longer transcripts support summary practice. Without a transcript, answers are saved without automatic scoring. There is no transcription or invented sentence timing. Optional AI evaluates written answers using the supplied transcript and your own key.
- **Save and start practicing** saves explicitly imported listening materials to your library. JSON backups **exclude audio files**, so keep your originals. Removing a bookmark retains imported source materials, progress and vocabulary.

### Run the website

Requires Node.js 22.12+ (Node 24 recommended) and npm. The public site needs no database, Docker or server API key:

```bash
npm ci
npm run db:generate
npm run dev
```

Open <http://localhost:3000>. For production:

```bash
npm run build:web
npm start
```

Both `npm run build` and `npm run build:web` build only the website. Extension packaging remains explicit through `extension:build` / `extension:release`. If an existing `.env` configures `DATABASE_URL`, production startup still checks and migrates that legacy database. Otherwise startup skips the database. See [.env.example](.env.example), [Netlify deployment and paid-mode roadmap](docs/netlify.md), [Vercel non-commercial preview](docs/vercel.md), and [legacy Railway records](docs/railway.md).

### Bring your own API

The reading sidebar shows API setup until configured; the same form is available under **My API**. Choose GPT / OpenAI, Claude / Anthropic, Grok / xAI, DeepSeek or a custom compatible endpoint, then enter your key and your provider's current JSON-capable model ID. No provider or model is preselected. Saving opens the article importer in place, without a model request. Configuration is session-only by default; persistent storage requires an explicit choice under **Storage & advanced**. Connection tests, generation and AI feedback require an explicit click. **Import original for free** keeps import and reading available without a key; free samples remain available throughout.

Official addresses are filled automatically; custom addresses remain editable. Claude uses native `/messages`; other providers use OpenAI-compatible `/chat/completions`. Thinking is disabled by default for the official DeepSeek endpoint. Changing providers or custom destinations clears the draft key; canceling preserves the saved configuration and article draft. Before saving, the form explains storage and transmission: the key and submitted text go directly to the chosen provider, not to WordWeave servers. Keys are excluded from learning-data exports, and server `LLM_*` variables are never a public fallback.

**The provider must permit browser CORS requests.** Network, permissions or CORS failures show an error without a proxy or provider switch. Accessing a localhost model from an HTTPS site is also subject to browser local-network permissions. Models still run on the provider's servers and may incur charges: local storage does not mean offline inference. Set spending limits with the provider and avoid persistent keys on shared computers.

### Storage and learning

- IndexedDB stores imported/generated articles, vocabulary, practice materials and records. Small drafts, sample state, reading-position journals and key configuration use browser storage. Data does not synchronize across browsers, devices or website origins. Clearing site data deletes it. Settings can export a key-free JSON backup excluding audio files; the full-site export has no import UI or cloud sync yet. Read Along has its own article-backup export and JSON import, compatible with the old site’s backups. Its articles and positions retain the `readalong.articles` local-storage key.
- Technical English accepts pasted text and UTF-8 TXT/Markdown, preserves the complete original and source URL, and aligns stable paragraph IDs. Code blocks are excluded from model rewriting, inline code and links are protected, and each paragraph can reveal its original. No URL scraping or PDF parsing.
- German supports A1/A2/B1, 3/5/8 new words, topics, specified vocabulary, source import and review-only mode. Chinese embedded-word passages align with natural German text. Cards include noun articles/plurals, verb forms and grammar guidance. Actual vocabulary coverage is validated before saving.
- Favoriting adds a word to review. Explicit “known” responses schedule 1/3/7/14/30-day intervals; ignored words pause review. Exposure and active review are tracked separately. Completion never implies mastery. Up to three due German words may recur in a new article.
- Mobile bottom-sheet word cards, desktop overlays, three gloss modes and saved reading preferences are shared. Deleting an article removes its links but keeps vocabulary and learning state. Practice can reuse a word's actual source sentence.
- Listening and speaking keep separate drafts, positions and speeds. Playback needs installed English/German system voices. Imported listening audio persists locally; speaking recordings stay on the current page and can be downloaded. There is no audio upload, transcription or pronunciation scoring. AI feedback evaluates written answers.
- Limits: 200 articles, 200 practice materials, 1,000 practice records (100 shown), and 100 task drafts per skill.

### Reliability

Model output is structured JSON, validated with Zod, paragraph correspondence, protected code, source sentences and target-word coverage. Imported instructions remain untrusted data. Long articles are split by paragraph without silent truncation. Failed regeneration retains the original and previous successful version.

Browser generation uses at most two concurrent chunks, two ordinary extra retries across an article (one per chunk), a four-minute overall timeout, a 90-second request timeout, and 8,192-token / 1 MiB output caps. UI guards and browser locks prevent duplicate generation of one article. Users pay their own provider charges; there is no owner-funded daily allowance.

Explicit provider refusals are distinguished from authentication or invalid JSON errors. Rejected technical chunks can be narrowed by paragraph, with up to eight extra localization calls; untranslated paragraphs preserve their originals and display their status. German generation keeps strict whole-document coverage requirements. Authentication, balance and unsupported configuration errors stop; temporary service errors retry within bounds. Browser network/CORS errors do not retry automatically. Translation correctness and every implicit refusal cannot be guaranteed. [Earlier fault records](docs/model-failure-checks.md) describe legacy server tests, not live-provider verification of this browser version.

### Legacy records and other tools

Existing PostgreSQL data, migrations and authenticated private APIs remain intact and are not exposed publicly or automatically migrated into browser storage. `/login` is the legacy owner's data entry. The public website needs neither invitations nor an owner password.

Server-funded AI endpoints are **disabled by default**, even with `LLM_API_KEY` configured. Explicit `SERVER_AI_ENABLED=true` restores them only for authenticated legacy owner workflows; public pages still use BYOK. Legacy `GENERATION_*` quotas apply only to those private endpoints.

For an existing database, set server-side `DATABASE_URL`, then run `npm run db:generate`, `npm run db:migrate` and `npm run db:check -- --schema`. The old local PostgreSQL can run through `docker compose up -d db`, with persistent data at `../.wordweave/postgres`. `setup`, `local` and `db:seed` remain legacy database helpers. Do not reset a database containing personal records.

The independent `extension/` focuses on English web-page translation: free translation by default, optional user-supplied AI key, no article library, invitation or website synchronization. Build an unpacked test version with `npm run extension:dev`, then load `extension/dist/` at `chrome://extensions`. This does not generate a store ZIP. See the [bilingual extension README](extension/README.md).

`workbench/` is the retained standalone SQLite/D1 app, not the public BYOK entry. Prefer `/listen` and `/speak` on the main website. The old standalone app still uses server-side configuration and must not be treated as the public BYOK site. See [workbench documentation](workbench/README.md).

### Verification

Run `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build:web`, then `npm run test:byok:browser`. Browser tests use local Chromium (`/usr/bin/chromium`, or `CHROMIUM_PATH`) and explicit model fixtures to verify direct BYOK requests, no owner-key usage, code protection, failures, persistence and browser isolation without paid API calls. `npm run test:practice` also covers the legacy database integration and requires PostgreSQL. These checks do not establish live language or speech quality.
