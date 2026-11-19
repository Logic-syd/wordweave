# 语境翻译插件 · Wordweave Translation Extension

[简体中文](#简体中文) | [English](#english)

## 简体中文

「语境 · Wordweave」的浏览器翻译工具，与[阅读器](../README.md#简体中文)、[听说工作台](../workbench/README.md#简体中文)同仓库维护，独立运行。插件使用免费翻译或使用者自己的 AI Key，不读取网站／工作台的服务端 `LLM_*` 配置，也不共享其学习记录。

当前聚焦英文网页翻译：点小精灵 →「翻译本页」或「翻译选中段落」。完成的段落立即显示，未完成的段落保留原文；随时恢复原文。无需账号或邀请码。

**正在开发、暂不上架。本轮没有生成新 ZIP。现有 0.2.1 安装包不包含以下改动。**

- 默认免费：Google 普通翻译；使用本地规则匹配英文表达，不为短语释义额外请求网络。匹配不上时保留普通译文。
- AI 可选：填自己的 Key，直连所选服务。按组显示已验证的译文，优先处理较小的首组；自动选择的模型短期缓存，不硬编码模型名称。
- 词卡只提供释义、原句、必要的表达说明与英语发音。没有文章库、收藏或学习打卡流程；德语学习仍在网页版。
- 英文保留量：少／中／多。释义：全部／首次／点击。
- 相同正文、设置和服务配置复用本机缓存。缓存最多 20 条、3 MiB，超限自动淘汰旧结果，无需手动管理文章。旧版本的文章与收藏数据另行保留，清除新缓存不会删除旧数据。

### 开发版试用

需要 Node.js 22.12+ 和 npm，无需 PostgreSQL 或运行中的网页版。以下命令均在仓库根目录执行。

```bash
npm ci
npm run extension:dev
```

Chrome 打开 `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择 `extension/dist/`；Edge 使用 `edge://extensions`。修改代码后重新运行开发构建、点击「重新加载」并刷新原网页。

`extension:dev` 只生成可加载的开发目录，不生成安装 ZIP 或商店素材。不要用旧 ZIP 测试本轮功能。

### 验证

先完成开发构建，再在仓库根目录运行：

```bash
npm run typecheck
npm run lint
npx vitest run tests/extension-translation.test.ts tests/extension-worker.test.ts tests/extension.test.ts
npm run test:extension:dom
npm run test:extension:ui
npm run test:extension -- --content-harness
```

自动化使用受控的 Chrome API 和翻译服务替身；真实内容脚本在 Chromium 中运行。覆盖逐段显示、后续结果不覆盖已恢复原文、代码保护、缓存去重、自动淘汰、密钥隔离与失败重试。测试中的毫秒数来自本地模拟服务，不能代表 Google 或 AI 的真实速度。当前环境尚不能验证原生 MV3 安装、权限弹窗与浏览器后台休眠，需要在个人 Chrome 实测。

### 边界

- 只处理英文网页，界面中文。普通正文、标题、列表内的段落和代码保护已支持；PDF、浏览器内部页面、iframe、Shadow DOM 和复杂交互应用不在本版范围。
- 单次最多 80 段、20,000 字符，超限明确提示选取一节，不静默截断。同时最多两篇翻译任务，服务请求有限并发。
- 免费服务使用 Google 公开网页接口，网络、限流或接口变化可能导致失败，不承诺持续可用。
- AI 使用个人 Key，没有每日调用配额；单次长度限制、超时与有限重试用于保持响应和稳定性。失败不会自动切换服务，后台中断后需主动重试。
- 正文只在主动翻译时发给所选服务，Key 不交给网页或语境网站。完整说明见插件里的「隐私说明」。

[发布准备记录](../docs/extension-release.md) 单独保留，等内测完成后再处理。个人网页版与数据库配置见 [项目说明](../README.md#简体中文)。

[English](#english)

---

## English

The browser translation tool in **语境 · Wordweave**, maintained in the same repository as the [reader](../README.md#english) and [listening & speaking workbench](../workbench/README.md#english). It runs independently, using free translation or the user's own AI key. It does not read the server-side `LLM_*` configuration or share learning records with the other tools.

The extension focuses on translating English webpages into Chinese while retaining useful English expressions. Click the sprite, then **Translate page** (`翻译本页`) or **Translate selected paragraphs** (`翻译选中段落`). Completed paragraphs appear immediately; pending paragraphs stay in their original form. You can restore the original page at any time. No account or invitation code is required.

**Development and testing are in progress; store submission is paused. No new ZIP has been produced for these changes. The previous 0.2.1 package does not include the features described below.**

- **Free by default:** Google provides ordinary translation. Local rules match English expressions to the translated text without extra network requests for phrase meanings. Unmatched text remains a normal Chinese translation.
- **Optional AI:** Enter your own API key and connect directly to your chosen service. Validated chunks appear progressively, with a smaller first chunk prioritized. Automatically selected models are briefly cached; no model name is hard-coded.
- **Word cards:** Contextual meanings, original sentences, explanations when needed, and English pronunciation. There is no article library, favorites management, or learning-status workflow. German learning remains in the web app.
- **Reading preferences:** Low/medium/high English retention, plus glosses shown always, on first occurrence, or on click.
- **Local cache:** The same source, settings, and provider configuration reuse a result. Up to 20 entries or 3 MiB are cached, with older results evicted automatically. There is no article-management task for the user. Older versions' article and favorite data is preserved separately; clearing the new cache does not delete that legacy data.

### Try the development version

You need Node.js 22.12+ and npm. The extension does not require PostgreSQL or a running web app. Run these commands from the repository root:

```bash
npm ci
npm run extension:dev
```

In Chrome, open `chrome://extensions` → enable **Developer mode** → choose **Load unpacked** → select `extension/dist/`. In Edge, use `edge://extensions`. After changing code, rebuild, click **Reload**, and refresh the original webpage.

`extension:dev` creates only a loadable development directory, not an installation ZIP or store materials. Do not use the previous ZIP to test these changes.

### Verification

After the development build, run these commands from the repository root:

```bash
npm run typecheck
npm run lint
npx vitest run tests/extension-translation.test.ts tests/extension-worker.test.ts tests/extension.test.ts
npm run test:extension:dom
npm run test:extension:ui
npm run test:extension -- --content-harness
```

Automated tests use controlled Chrome API and translation-service substitutes, with the actual content scripts running in Chromium. They cover progressive rendering, ignoring late results after restoring the original page, code protection, request deduplication, cache eviction, credential isolation, and explicit retries. Timings come from local mock services and do not measure real Google or AI latency. Native MV3 installation, permission dialogs, and background-worker suspension still need testing in a personal Chrome installation.

### Scope and limits

- English webpages only; the interface is in Chinese. Ordinary prose, headings, paragraphs within lists, and code protection are supported. PDFs, browser-internal pages, iframes, Shadow DOM, and complex interactive applications are outside the current scope.
- Each request supports up to 80 paragraphs and 20,000 characters. Larger inputs prompt you to select a shorter section instead of silently truncating it. At most two translation jobs run at once, with bounded provider-request concurrency.
- Free mode uses Google's public webpage translation endpoint. Network restrictions, rate limits, or service changes can make it unavailable; continued availability is not guaranteed.
- AI uses your own key and has no daily-call quota. Input limits, timeouts, and bounded retries keep the extension responsive. Failures never switch providers automatically; an interrupted background task requires an explicit retry.
- Text is sent only when you initiate translation, and only to the selected service. Your key is not given to the webpage or the Wordweave website. Read **Privacy** (`隐私说明`) inside the extension for the full policy.

[Release preparation](../docs/extension-release.md) (Chinese) is kept separately until testing is complete. See the [project README](../README.md#english) for the personal web app and database setup.

[简体中文](#简体中文)
