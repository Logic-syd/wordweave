# Railway 部署公开 BYOK 网站

当前网站公开提供 `/listen`、`/speak`、`/read`，无需注册。每个人在 `/settings` 填自己的 API，由浏览器直接调用供应商；学习记录在各自浏览器。**不要为公开用户填写站主模型 Key。**

## 已有 Railway 服务

1. 将需要部署的代码提交并推送到关联的 GitHub 分支；Codex 环境快照不会代替 Git 推送。
2. 在应用服务 Settings 确认下列命令。
3. Variables 设置 `SERVER_AI_ENABLED=false`。已有 `LLM_*` 可以移除；即使保留，关闭开关时旧生成接口也不会使用它们。
4. 重新部署后，用未登录窗口验证三个入口，以及「我的 API」页面。

| 设置 | 值 |
| --- | --- |
| Build Command | `npm run db:generate && npm run build:web` |
| Start Command | `npm start` |
| Pre-deploy Command | 公开版无需；若已有旧数据库迁移步骤，可继续保留 |
| Healthcheck Path | `/api/health` |
| Healthcheck Timeout | 120 秒 |

使用 `build:web` 不会打包浏览器插件。Railway 注入 `PORT`，无需手填。部署设置请在 Dashboard 核对，不要只依赖仓库的旧 `railway.json`。

**已有 PostgreSQL 不要删除。** 原私人记录不会公开，也不会迁移到浏览器。保留 `DATABASE_URL` 时，`npm start` 会继续检查连接、执行已有增量迁移并验证表；数据库失败会阻止启动。若只想运行公开版，可以取消应用的 `DATABASE_URL` 引用，但保留数据库服务与备份；公开页无需读库。移除连接不是数据迁移或数据库备份。

原站主认证仍保护旧数据接口；不要将 `ADMIN_ACCESS_TOKEN` 分享给访客。不要设置 `SERVER_AI_ENABLED=true`，除非确实要恢复站主自己的旧服务器生成流程。公开页即便此开关打开，仍使用浏览器 BYOK。

## 首次部署

Railway 新建项目 → 从 GitHub 选择 `Logic-syd/wordweave` → 根目录使用仓库根目录。配置上面的构建、启动和健康检查，设置 `SERVER_AI_ENABLED=false` 即可。不需要 PostgreSQL、`LLM_API_KEY`、站主密码或邀请码。

部署成功后：应用服务 → Settings → Networking → Public Networking → Generate Domain，生成 HTTPS 地址。公开版没有数据库连接时 `/api/health` 返回：

```json
{"status":"ok","storage":"browser"}
```

确保最新部署成功；新部署失败时旧部署仍可能显示 Online。用这个域名打开首页，在「我的 API」配置你用于测试的个人 Key，先运行少量测试。该 Key 属于这个浏览器，不会写入 Railway 环境变量。

## 验证与排错

- 三个入口都能未登录打开；范文、朗读、收藏和本机进度不需要 Key。
- 导入不需要登录；未配置 Key 时可保存原文，配置后再主动生成。
- 模型服务必须允许网页 CORS 请求。错误提示说明网络／CORS 问题时，应检查服务商的浏览器访问支持；不要给网站增加站主 Key 作为兜底。
- 浏览器只向配置的模型地址发送 Key；学习内容只在主动调用 AI 时发送给该供应商。页面不上传原文、词卡或录音到语境后端。
- 更换 Railway 域名不会带走旧域名的浏览器记录；不同浏览器也不会自动同步。可在设置导出不含 Key 的记录，目前没有备份导入 UI。
- 构建缺少 Prisma Client：检查 Build Command 是否包含 `npm run db:generate`。即便公开页不使用数据库，保留的旧私有接口在构建时仍需要客户端类型。
- 配置旧数据库时启动失败：运行 `npm run db:check` 或查看启动日志，确认 Railway 私网 `DATABASE_URL` 引用；不能使用本机 localhost 连接串。不要 `migrate reset` 或重建已有表。

本地生产验证：`npm run build:web && npm start`。旧库维护：`npm run db:migrate`、`npm run db:check -- --schema`。公开版无数据库时不要运行旧的 `deploy:prepare` 预部署脚本。

## English quick reference

The public site is registration-free and BYOK. Use build command `npm run db:generate && npm run build:web`, start command `npm start`, health check `/api/health`, and `SERVER_AI_ENABLED=false`. No PostgreSQL or owner API key is required for a new deployment.

Keep existing PostgreSQL data and backups intact. Configured `DATABASE_URL` still triggers legacy migrations at startup; removing the application reference does not migrate or delete database records. Authenticated private APIs remain protected and server-funded AI is disabled by default.

Generate an HTTPS domain in the application service's Networking settings. Each visitor configures their own API in `/settings`; browser requests require provider CORS support. Records are local to the browser and website origin. Updating the deployed site requires committing/pushing code and deploying it; creating an environment snapshot alone does not update Railway.
