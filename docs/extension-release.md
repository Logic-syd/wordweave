# 语境插件：先完善，再打包

当前开发源码为 0.3.0：免费翻译默认开启，AI 可选使用 GPT、Claude、Grok、DeepSeek 或自定义兼容接口，Key 仅保留于浏览器会话。不要上传此前的 0.2.1 候选包；它不包含当前开发改动。按当前要求，本轮只改代码，没有重新生成 ZIP 或商店素材，也没有提交商店。

开发版入口：`npm run extension:dev`，Chrome 加载 `extension/dist/`。当前功能和验证范围见 [插件说明](../extension/README.md)。

下一次明确发布时，再依次完成：

1. 在个人 Chrome 测试真实免费翻译与 AI、恢复原文、权限弹窗和后台休眠。
2. 核对 manifest 版本、离线和[公开隐私说明](../extension/PRIVACY.md)与最终源码一致；公开链接需要无需登录即可访问。旧网站隐私页和旧商店素材不适用于当前开发版。
3. 更新商店截图及文案，移除旧的文章库／收藏说明。`extension/store/chrome/submission.md` 暂存的是上一版提交参考。
4. `npm run extension:release` 生成并检查新安装包，然后在 Chrome 开发者后台填表提交。

开发构建不生成 ZIP；`extension:build` / `extension:release` 是显式打包命令。网站的 `npm run build` / `npm run build:web` 只构建网站，不打包插件。

插件无需邀请码，自带 AI Key，不使用网页版 Key。网页版继续保留个人文章库与学习功能；插件仅提供翻译和本机缓存。

## 2026-11-20 开发验证

- `npm run typecheck`、`npm run lint`、`npm run extension:dev` 通过。只生成开发目录，没有生成 ZIP 或商店素材。
- 扩展相关 46 项单元测试、12 项 DOM 浏览器检查、12 项设置／安装页检查、9 项本地流程检查通过。Chrome API 和 AI 服务使用明确的测试替身，内容脚本使用实际编译结果。
- 覆盖四家服务商的协议、非法响应与拒绝处理、会话 Key 迁移／清除／存储失败、服务切换清空旧 Key、重复提交、缓存和代码保护。手机设置页和词卡没有横向溢出，打开／关闭词卡保持阅读位置。
- 当前云浏览器的管理策略禁止安装扩展，原生 MV3 安装、权限弹窗、真正的浏览器重启及后台休眠需在个人 Chrome 实测。没有使用真实 AI Key，四家服务商的账号连通性尚未验证。
- 使用一条公开的 React 示例句探测免费 Google 接口，当前云网络收到 HTTP 302，转向 `www.google.com`。插件按现有规则拒绝跟随重定向，因此这次真实免费翻译未成功；仍需在个人 Chrome 复测，不能用模拟测试代替真实可用性结论。
