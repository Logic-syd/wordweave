# Read Along · 逐句跟读

[中文](#中文) · [English](#english)

## 中文

恢复自本仓库 `reading` 分支的 `e2f5e3a`，对应用户提供的「文章收件箱 / LISTEN · PAUSE · REPEAT」版本。沿用原界面源码、左右布局、淡紫背景和粉色当前句，不是按截图另做一套。

- 首页 `/` 和 `/read` 打开这套界面。右上角可去听力、口语、共用单词库和「我的 API」。
- 粘贴英文、导入 UTF-8 TXT / Markdown、恢复旧版 JSON 文章备份。自动分句在本机完成，不用 AI。首次打开已有日常英语示例。
- 开始跟读自动展开正文，暂停后保持展开；「文章与设置」恢复左右两栏。连续听读、留白跟读、单句循环、声音和语速沿用原操作。
- 选中单词或短语，直接请求 Google 免费翻译，只发送选中部分，不用 Key。失败可以重试或手填释义，不回退到 AI。该公开接口可能受网络、跨域、限流或服务调整影响，不保证可用性。
- 点击「想学」进入现有听说读共用单词库，保留文章和原句链接。词语不同义项分开保存。
- 可选的段落整理、全文中文参考使用「我的 API」中的个人配置，由浏览器直连服务商。没有服务端 Key 回退，没有硬编码模型。模型输出需通过结构与段落覆盖校验。
- 原版 `readalong.articles` 存储键、文章 ID、当前句位置和已标注词保留。旧站域名的数据不会自动迁移；在旧站「导出文章备份」，到新站「导入文件」选择 JSON 即可。备份不包含 API Key。

### 运行

在仓库根目录执行 `npm ci`、`npm run db:generate`、`npm run dev`，打开 http://localhost:3000 。`npm run build:web` 构建网站与本界面，`npm start` 启动生产版。无需 PostgreSQL 或站主模型配置。

`reading/web/` 是原界面与本机接口适配，`scripts/build-readalong.mjs` 生成忽略提交的 `public/read-along/`。开发时修改该目录后运行 `npm run reading:build` 并刷新；初次启动与生产构建会自动执行。公开部署使用根目录 [Vercel 配置](../docs/vercel.md)，不单独部署旧 Worker。

URL 提取仍只支持 Guardian / Cup of Jo 的公开文章，严格限定 HTTPS 域名、拒绝重定向并限制体积与时长；其他来源粘贴正文。听读使用设备的英语语音，不能保证每台设备都有可用声音，不生成可下载音频。本工具仍以英语为主；英德语境文章保留在 `/library` 和 `/read/:id`。

验证：`npm run test:reading`；网站运行后执行 `npx playwright test tests/e2e/readalong.spec.ts`。浏览器测试用模拟语音和模型响应，不代表真实设备发音或模型语言质量通过验证。

## English

Restored from this repository's `reading` branch at `e2f5e3a`, preserving the original article inbox, two-column layout, lavender background and pink sentence highlighting.

Both `/` and `/read` open Read Along. Starting playback expands the article; stopping retains the expanded view. Use the toolbar to bring the inbox back. Sentence splitting, device-voice playback and local progress require no model. The first visit includes a short English sample.

Select an English word or phrase for free Google translation. Only the selection is sent, without an API key. Network or service failures offer retry/manual definitions and never fall back to AI. This public endpoint has no availability guarantee. Saved words use the shared listening/speaking/reading vocabulary bank with their source sentence.

Optional paragraph grouping and Chinese reference translation use the learner's browser API settings and validated JSON. They never use the owner's server credentials. Existing article IDs, vocabulary and positions are preserved. To move from the old website origin, export its article backup and import the JSON file here; browser storage cannot migrate across domains automatically.

Run the website from the repository root using `npm ci`, `npm run db:generate`, and `npm run dev`. Production uses `npm run build:web` and `npm start`; no database or owner API key is needed. The build bundles this frontend into ignored `public/read-along/` files. After editing `reading/web/` during development, run `npm run reading:build` and refresh. Deploy the root Vercel project, not the legacy Worker.

URL extraction supports only public Guardian/Cup of Jo pages, with host, redirect, response-size and timeout restrictions. Other articles can be pasted or imported as text. Read Along currently uses English device voices; the contextual English/German library remains available at `/library`. Tests: `npm run test:reading` and, with the website running, `npx playwright test tests/e2e/readalong.spec.ts`. Browser tests use simulated speech and model responses, not real pronunciation or language-quality evaluation.
