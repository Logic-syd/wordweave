# 语境插件：当前暂停发布

当前在精简英文翻译体验并验证速度。不要上传此前的 0.2.1 候选包；它不包含当前开发改动。该包和商店素材没有在本轮重新生成。

开发版入口：`npm run extension:dev`，Chrome 加载 `extension/dist/`。当前功能和验证范围见 [插件说明](../extension/README.md)。

下一次明确发布时，再依次完成：

1. 在个人 Chrome 测试真实免费翻译与 AI、恢复原文、权限弹窗和后台休眠。
2. 更新 manifest 版本、离线和公开隐私说明；确认线上公开地址已部署。
3. 更新商店截图及文案，移除旧的文章库／收藏说明。`extension/store/chrome/submission.md` 暂存的是上一版提交参考。
4. `npm run extension:release` 生成并检查新安装包，然后在 Chrome 开发者后台填表提交。

开发构建不生成 ZIP；`extension:build` / `extension:release` 仍是显式打包命令，网站的 `npm run build` 也包含打包步骤。只验证网站编译且不打包插件时使用 `npx next build`。

插件无需邀请码，自带 AI Key，不使用网页版 Key。网页版继续保留个人文章库与学习功能；插件仅提供翻译和本机缓存。
