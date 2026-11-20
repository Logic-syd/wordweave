# 语境插件隐私说明 · Wordweave Extension Privacy Notice

适用于 0.3.0 开发版，更新于 2026-11-20。本说明不适用于旧版安装包或独立网页版。

## 简体中文

### 正文与 Key 的去向

你主动点击翻译后，插件读取当前英文网页正文或选中段落。免费模式把待译文字发送给 Google 的 `translate.googleapis.com`，使用 HTTPS 请求参数。AI 模式把待译段落、翻译要求和你填写的 API Key 直接发送给你选择的服务商：OpenAI（`api.openai.com`）、Anthropic（`api.anthropic.com`）、xAI（`api.x.ai`）、DeepSeek（`api.deepseek.com`），或自定义接口。不额外发送网页标题和来源网址；这些信息若出现在所选正文里，仍会随正文发送。自定义接口的运营者也会接收 Key 和正文。

新安装默认免费，不预选 AI 服务商。保存前会显示请求的接收域名，切换服务商或修改地址会清空待填写的 Key。保存设置不会调用模型；点击「测试连接」，或未指定模型时首次翻译，会使用 Key 查询模型列表。翻译失败不会自动切换服务。

正文和 Key 不发送给语境服务器；Key 不交给正在阅读的网页或内容脚本。服务商会接收 IP 等连接信息，并可能记录请求，保存和使用规则取决于其政策。插件无法撤回已经发送的请求。插件不会自动读取全部浏览历史，也未加入广告或行为统计服务。

点击词卡发音时，词语交由浏览器或系统的英语语音服务朗读。部分语音可能使用在线服务，数据处理取决于浏览器、系统和所选语音。

### 本机存储

- API Key 仅存于扩展的 `chrome.storage.session` 会话存储，仅插件受信任页面和后台可访问，不写入长期设置或翻译缓存。关闭设置页、后台暂时休眠不会清除 Key；重启浏览器、禁用、更新或重新加载插件后需重新填写。
- 翻译偏好、服务地址和模型名称存于 `chrome.storage.local`，不通过浏览器账号同步。
- 标题、来源网址、原文和译文作为本机翻译缓存保存，最多 20 条、3 MiB，超限淘汰旧结果。
- 从旧版升级时，将原来长期保存的 Key 转入本次会话并移除长期副本，同时清除旧版网站访问令牌。旧版文章和收藏记录单独保留，本版不提供文章库界面。

会话存储不是加密密码库，无法保证受损设备或受损插件上的密钥安全。插件记录不与语境网页版同步。

### 权限与删除

`activeTab` 和 `scripting` 用于点击后读取当前网页、展示或恢复译文；`storage` 用于设置、会话凭据和缓存。Google 域名权限支持免费翻译；配置 AI 时仅申请所选服务的域名权限。自定义服务要求 HTTPS，本机调试允许 localhost / 127.0.0.1 的 HTTP。

设置中的「清除 Key」会删除保存的凭据并切回免费翻译，保留缓存。已经进行的请求可能继续完成；如需停用 Key，请到服务商控制台撤销。「清除翻译缓存」只删除当前翻译缓存，不删除旧版文章和收藏。卸载插件会删除全部插件本机数据；不会删除服务商已收到的数据。

联系：[GitHub Issues](https://github.com/Logic-syd/wordweave/issues)。该页面公开，请勿提交 Key、密码或私人文章。数据处理变化时随插件版本更新本说明。

## English

Applies to development version 0.3.0, updated 2026-11-20. This notice does not cover older packages or the separate web app.

### Where content and keys are sent

When you initiate translation, the extension reads the current English article or selected paragraphs. Free mode sends text to Google's `translate.googleapis.com` using HTTPS query parameters. AI mode sends the selected paragraphs, translation instructions, and your API key directly to the selected provider: OpenAI (`api.openai.com`), Anthropic (`api.anthropic.com`), xAI (`api.x.ai`), DeepSeek (`api.deepseek.com`), or your custom endpoint. The page title and source URL are not attached separately; any such information within the selected text is still sent. A custom endpoint's operator also receives the key and text.

New installations default to free translation, with no AI provider selected. The receiving domain is shown before saving; changing providers or addresses clears the key input. Saving settings does not call a model. Testing the connection, or translating without a specified model, queries the provider's model list using your key. A failed translation never switches providers automatically.

Content and keys are not sent to Wordweave servers. Keys are not passed to the webpage or content scripts. Providers receive connection information such as your IP address and may log requests according to their own policies. Sent requests cannot be recalled. The extension does not automatically read your full browsing history and includes no advertising or behavioral analytics service.

Clicking pronunciation sends the word to the browser or operating system's English speech service. Some voices may use online services; data handling depends on the browser, system, and selected voice.

### Local storage

- Keys are held only in the extension's `chrome.storage.session`, accessible to trusted extension pages and the background worker. They are not written to persistent preferences or translation caches. Closing settings or suspending the worker does not clear the key. Restarting the browser, disabling, updating, or reloading the extension requires entering it again.
- Preferences, service addresses, and model names use `chrome.storage.local`, without browser-account synchronization.
- Titles, source URLs, source text, and translations are cached locally, up to 20 entries or 3 MiB, with older entries evicted automatically.
- Upgrading moves an older persistently saved key into the current browser session and removes its persistent copy, along with obsolete website-access tokens. Older article and favorite records are preserved separately; this version has no article-library interface.

Session storage is not an encrypted vault and cannot ensure key safety on a compromised device or extension. Records are not synchronized with the Wordweave website.

### Permissions and deletion

`activeTab` and `scripting` read the current page and display or restore text after your click. `storage` holds preferences, session credentials, and caches. Google host access enables free translation; configuring AI requests access only to the chosen provider's host. Custom endpoints require HTTPS, with HTTP allowed for localhost / 127.0.0.1 development.

**Clear key** removes saved credentials and switches to free mode while retaining the cache. In-flight requests may finish; revoke a key at your provider to disable it. **Clear translation cache** removes the current cache without deleting legacy articles or favorites. Uninstalling removes all local extension data, but does not delete data already received by providers.

Contact: [GitHub Issues](https://github.com/Logic-syd/wordweave/issues). This is a public page; do not post keys, passwords, or private articles. This notice will be updated with versions that change data handling.
