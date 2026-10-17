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

## 4. 部署顺序

仓库中的 `railway.json` 已设置：

1. Railpack 安装依赖，并执行 `npm run db:generate && npm run build`。
2. 在私有网络中执行预部署命令 `npm run deploy:prepare`：应用迁移；`SEED_DEMOS=true` 时写入演示。失败会阻止此次部署继续。
3. 使用 `npm run start` 启动正式服务。容器进程重启时不会重新执行数据库迁移。
4. Railway 请求 `/api/health`，应用可读取数据库文章表时才返回 200；数据库不可用或尚未初始化时返回 503。

Prisma CLI、tsx 与 TypeScript 放在运行依赖中，供预部署迁移、演示初始化及配置加载使用，即使平台裁剪开发依赖也能运行。

不要在 Railway 上运行 `npm run setup` 或 `npm run local`，这两个命令用于本机 Docker 数据库。不要在 Railway 上执行 `prisma migrate reset`。

## 5. 生成 HTTPS 测试地址

部署成功后，打开 **应用服务 → Settings → Networking → Public Networking → Generate Domain**。Railway 会为应用分配 HTTPS 域名。这个操作针对 Next.js 应用服务，不是 PostgreSQL 服务。

先访问地址后面的 `/api/health`，应得到 `{"status":"ok"}`，再打开首页和两篇演示。随后用一小段英文进行真实生成测试，确认 DeepSeek 权限与余额、模型 ID 和结构化输出能力。

目前是个人版，没有账户认证。持有公开地址的人可以访问同一份学习数据并调用生成接口；对外开放前应在入口配置访问保护，不要把随机域名当作身份验证。

## 数据与故障排查

Railway 上的新数据库不会自动包含 Codex 或本机数据库中的个人文章、收藏和学习进度。演示可以通过 seed 重新初始化；如需搬迁个人数据，应先备份，再恢复到目标 PostgreSQL，避免覆盖已有目标数据。

- 构建提示 Prisma Client 不存在：确认使用仓库的构建命令，并检查依赖安装结果。
- 预部署迁移连接失败：检查 `DATABASE_URL` 引用是否指向同项目已运行的 PostgreSQL。
- 健康检查 503：检查迁移日志与数据库连接；这个接口不会调用模型，也不会显示密钥。
- 页面能打开但生成失败：检查三项 `LLM_*`；不要使用翻译插件的展示名称替代真实模型 ID。
- 重新部署后演示自动回来：将 `SEED_DEMOS` 设为 `false`；seed 是幂等的，但会补回已删除的演示。

官方参考：

- [Config as Code](https://docs.railway.com/config-as-code/reference)
- [Pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Public networking](https://docs.railway.com/networking/public-networking)
