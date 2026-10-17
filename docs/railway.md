# Railway 首次部署

当前架构为一个 Next.js 全栈服务（页面、后端接口、生成逻辑），连接独立的 PostgreSQL 服务。数据库与应用分别部署，前端与后端仍属于同一个应用，不应描述成前后端独立部署。

完成部署后，可以用于项目介绍的表述：

> 独立开发并部署基于 Next.js、TypeScript 和 PostgreSQL 的语言学习全栈应用，实现前后端分层、结构化模型输出校验、语境词卡、学习记录与跨文章复习。

## 1. 将代码同步到 GitHub

先把本次云工作区的改动提交并推送到 `Logic-syd/wordweave`。发布 Codex 环境快照不会代替 Git 提交或推送。确认 GitHub 的目标分支中能看到 `package.json`、`railway.json`、`src/` 和 `prisma/migrations/`，再连接部署。

不要上传 `.env`、数据库文件、依赖目录或真实密钥。源码包仅包含 `.env.example`，没有真实密钥。

## 2. 创建 Railway 项目和 PostgreSQL

登录 Railway，创建空项目，在项目中添加一个 PostgreSQL 服务。保持数据库使用项目私有网络即可，不必为数据库创建公网域名或 TCP 公共访问。

再从 GitHub 添加应用服务，选择 `Logic-syd/wordweave` 和包含完整代码的分支，根目录设为仓库根目录。第一次自动构建若在变量填写前开始，可先填写变量后重新部署。

## 3. 在应用服务中填写变量

变量加在 **Next.js 应用服务** 上：

| 名称           | 如何设置                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | 使用 Railway 的变量引用功能，选择同项目 PostgreSQL 服务的 `DATABASE_URL`。不要复制本地 localhost 数据库 URL |
| `LLM_API_KEY`  | 在 Railway 安全变量设置中填入自己的 DeepSeek API Key                                                        |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1`                                                                               |
| `LLM_MODEL`    | DeepSeek 开放平台当前支持 JSON 输出的准确模型 ID                                                            |
| `SEED_DEMOS`   | 首次部署设为 `true`，初始化两篇演示；之后可删掉此变量或设为 `false`                                         |

没填模型变量也能启动和阅读演示，但生成新内容不可用。模型名称不硬编码。

无需手填 `PORT`：Railway 会注入端口，Next.js 的启动命令会读取它，并监听 `0.0.0.0`。

Codex 云环境里的代理密钥可能是仅对其平台代理有效的占位绑定。请从 DeepSeek 开放平台在 Railway 中安全填写真实 Key，不要从云环境导出密钥或复制整份进程环境。也不要复制 Codex 的 `HTTP_PROXY`、`HTTPS_PROXY` 或 CA 路径到 Railway。

## 4. 在应用服务 Settings 中设置部署命令

Railway 官方文档已将旧的 Config as Code 标为弃用：新服务不能启用 `railway.json` / `railway.toml`；原来已使用它们的服务仅兼容到 2026-12-01。仓库保留 `railway.json` 作为旧服务兼容配置，**新建服务必须在 Dashboard 明确设置下面的值**，不能依赖这个文件自动生效。后续如需代码化管理，可按官方 Infrastructure as Code 指南迁移。

打开 **wordweave → Settings**，在 Build 和 Deploy 区域分别设置：

| 设置 | 值 |
| --- | --- |
| Builder | Railpack |
| Build Command | `npm run db:generate && npm run build` |
| Pre-deploy Command | 留空；启动命令已包含迁移与初始化 |
| Start Command | `npm run start` |
| Healthcheck Path | `/api/health` |
| Healthcheck Timeout | `120` 秒 |

保存后点击项目的 **Deploy / Apply changes**，确认新部署使用的是这些设置。`npm run start` 会通过 npm 的 `prestart` 自动执行连接检查、迁移和可选演示初始化，无须额外寻找预部署按钮。此前已配置 `npm run deploy:prepare` 作为预部署步骤也可以继续使用，只是启动时会再检查一次。

部署按以下顺序执行：

1. Railpack 安装依赖，并执行 `npm run db:generate && npm run build`。
2. 启动命令 `npm run start` 自动触发 `prestart`，先执行 `npm run deploy:prepare`：检查连接、应用待执行迁移；`SEED_DEMOS=true` 时初始化演示。任一步失败会阻止 Next.js 启动。
3. 验证文章表可读后启动 Next.js。容器进程重启时再次执行上述步骤，Prisma 只应用尚未执行的迁移；成功演示会跳过，不会覆盖已有收藏、阅读进度或生成偏好。
4. Railway 请求 `/api/health`，应用可读取数据库文章表时才返回 200；数据库不可用或尚未初始化时返回 503。

在 **Deployments → 最新部署 → Deploy Logs** 检查实际状态和启动日志，应看到 `prisma migrate deploy` 成功应用迁移或提示没有待执行迁移，然后出现文章表 ready 和 Next.js ready。若新部署失败，旧版本可能仍显示 Online；因此不要仅凭服务卡片判断本次部署成功。首次成功迁移后 PostgreSQL 中应有 `Article`、`VocabularyItem`、`_prisma_migrations` 等表；`SEED_DEMOS=true` 时还会写入两篇演示。

Prisma CLI、tsx 与 TypeScript 放在运行依赖中，供启动迁移、演示初始化及配置加载使用，即使平台裁剪开发依赖也能运行。第一版使用一个应用实例；扩展多个实例前，应将初始化协调为独立部署任务，避免同时首次写入演示。首次初始化后可将 `SEED_DEMOS` 设为 `false`，防止删除过的演示在重启时被补回。

不要在 Railway 上运行 `npm run setup` 或 `npm run local`，这两个命令用于本机 Docker 数据库。不要在 Railway 上执行 `prisma migrate reset`。

## 5. 生成 HTTPS 测试地址

部署成功后，打开 **应用服务 → Settings → Networking → Public Networking → Generate Domain**。Railway 会为应用分配 HTTPS 域名。这个操作针对 Next.js 应用服务，不是 PostgreSQL 服务。

先访问地址后面的 `/api/health`，应得到 `{"status":"ok"}`，再打开首页和两篇演示。随后用一小段英文进行真实生成测试，确认 DeepSeek 权限与余额、模型 ID 和结构化输出能力。

目前是个人版，没有账户认证。持有公开地址的人可以访问同一份学习数据并调用生成接口；对外开放前应在入口配置访问保护，不要把随机域名当作身份验证。

## 数据与故障排查

Railway 上的新数据库不会自动包含 Codex 或本机数据库中的个人文章、收藏和学习进度。演示可以通过 seed 重新初始化；如需搬迁个人数据，应先备份，再恢复到目标 PostgreSQL，避免覆盖已有目标数据。

- 构建提示 Prisma Client 不存在：确认使用仓库的构建命令，并检查依赖安装结果。
- 应用显示 Online 但数据库没有表：确认正在部署最新代码，Start Command 为 `npm run start`，并检查日志是否执行 `prestart` 和 `prisma migrate deploy`。直接运行 `next start` 会跳过初始化；仅上传 `railway.json` 不会为新服务设置健康检查。
- 预部署迁移连接失败：检查 `DATABASE_URL` 引用是否指向同项目已运行的 PostgreSQL。
- 日志出现 `ECONNREFUSED`：连接目标拒绝了连接；先看预部署或启动日志的 `[database] target=主机:端口`，不能仅凭此错误认定是缺表。配置为空或未展开会明确报告 `DATABASE_URL_MISSING` / `DATABASE_URL_UNRESOLVED`；Railway 上的 localhost 连接会报告 `DATABASE_URL_LOCAL_ON_RAILWAY`。
- Postgres 自身的 `DATABASE_URL` 为 `<empty string>`：应用引用后也会为空。先在 **Postgres → Variables** 恢复值 `postgresql://${{PGUSER}}:${{PGPASSWORD}}@${{PGHOST}}:${{PGPORT}}/${{PGDATABASE}}`，再确认 **wordweave → Variables** 的值为 `${{Postgres.DATABASE_URL}}`，应用变更并重新部署 wordweave。
- 迁移日志成功但数据库页面仍为空：刷新 Database 页面，核对日志中的数据库名、schema 与正在查看的 Postgres 服务及环境。不要手动新建空表或重置数据库。
- 健康检查 503：响应中的 `code` 是经过白名单筛选的错误码，结合部署日志检查连接与迁移。此接口不返回主机、用户名、密码或完整连接串，也不会调用模型。
- 页面能打开但生成失败：检查三项 `LLM_*`；不要使用翻译插件的展示名称替代真实模型 ID。
- 重新部署后演示自动回来：将 `SEED_DEMOS` 设为 `false`；seed 是幂等的，但会补回已删除的演示。

可在应用的终端运行 `npm run db:check` 检查连接，或 `npm run db:check -- --schema` 检查文章表。诊断只输出主机、端口和受控错误提示，不输出完整连接串、账号或密码。若目标已经是 Postgres 内网主机但仍拒绝连接，检查 Postgres 的日志是否出现 ready to accept connections、数据库端口是否匹配，并确认两项服务位于同一 Railway 环境。

官方参考：

- [Config as Code 弃用说明](https://docs.railway.com/config-as-code)
- [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [Pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Public networking](https://docs.railway.com/networking/public-networking)
