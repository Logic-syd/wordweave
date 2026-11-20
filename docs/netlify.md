# Netlify 上线

当前路线：先公开提供基础版和用户自带 API 的增强功能，未来增加站方提供额度的付费模式。保持 `reading` 分支恢复的 Read Along 界面，不增加首次进入时的套餐选择。

## 第一次部署

1. 打开 https://app.netlify.com/start ，使用 GitHub 登录。
2. 选择导入现有 Git 仓库，授权访问并选择 `Logic-syd/wordweave`。
3. 分支选择 `main`，基础目录保持仓库根目录（留空或 `.`）。环境变量留空。
4. 点击部署。`netlify.toml` 已提供构建命令和发布目录。
5. 部署成功后，在项目概览或域名设置里复制实际的 `https://….netlify.app` 地址。首页就是原版文章收件箱和逐句跟读。

如果控制台需要手填，构建命令为 `npm run db:generate && npm run build:web`，发布目录为 `.next`。Netlify 会自动使用官方 Next.js Runtime，不需要单独选择 `reading/`、手动上传 HTML 或配置启动命令。公开版不需要 PostgreSQL 或站主模型 Key。

Netlify 提供免费方案，适用于额度内试运行；免费额度、适用条款与超额处理以 [当前方案](https://www.netlify.com/pricing/) 和账户控制台为准。这里没有核实或承诺具体的最新额度。Vercel Hobby 限个人非商业用途，不能只根据“用户暂时不付钱”判断一个商业产品是否适用。

## 基础版、自带 API 和未来付费版

| 模式 | 体验 | 谁支付模型费用 | 当前状态 |
| --- | --- | --- | --- |
| 基础版 | 导入正文、自动分句、设备朗读、跟读、听写、收藏和本机记录；选词免费查义 | 不调用大模型 | 已实现 |
| 自带 API | 自己填写 Key，主动使用全文中文参考、学习内容生成和文字反馈 | 使用者向自己的模型供应商付费 | 已实现；供应商需允许浏览器跨域请求 |
| 站方付费模式 | 购买站方提供的额度，免去个人 API 配置 | 站方计费并承担供应商调用费用 | 尚未实现 |

用户第一次打开直接学习；右上角「我的 API」作为可选增强设置。现在不要求注册。免费查义依赖第三方网络服务，设备朗读依赖本机可用语音，两者都不代表完全离线或不限量。

付费模式需要另行实现账户身份、订单与支付回调、服务端额度账本、请求限流和成本上限。站方 Key 只保存在服务端，按已支付额度授权调用；不在浏览器共享 Key，也不以开启旧 `SERVER_AI_ENABLED` 开关代替计费权限。基础版与个人 Key 路径继续保留。

当前没有云同步；换浏览器或域名不会自动带过记录。旧 Read Along 文章可以从旧站导出 JSON，再在新站「导入文件」。

## 部署记录与检查

| 项目 | 记录 |
| --- | --- |
| Git 仓库与分支 | https://github.com/Logic-syd/wordweave · `main` |
| Netlify 项目 / 域名 | 尚未连接账户或创建线上项目；成功部署后记录实际链接 |
| 已有验证 | 网站在无数据库、无站主 Key 的本地生产构建和启动检查通过；这不等于 Netlify 托管部署已成功 |

部署后验证首页、`/listen`、`/speak`、`/vocabulary`，刷新后记录仍在；`/api/health` 应返回 `{"status":"ok","storage":"browser"}`。用隐私窗口检查无 Key 仍能使用基础功能，再在正常窗口以自己的配置测试 AI。不能把尚未获得的域名写成已上线地址。

## English

Import `Logic-syd/wordweave` from GitHub at https://app.netlify.com/start. Choose `main`, keep the repository root, leave environment variables empty, and deploy. The committed `netlify.toml` sets `npm run db:generate && npm run build:web`, publishes `.next`, uses Node 24 and disables owner-funded AI. Netlify automatically installs its Next.js Runtime. No database or owner API key is required.

The current product offers free core learning and optional bring-your-own-key AI in the same interface. A future paid, provider-managed allowance is planned but not implemented. It requires account identity, payments, server-side quotas and cost controls; provider keys must remain on the server. No signup or plan selection is introduced for the current public version.

Check Netlify's current plan terms, usage allowances and overage behavior in its dashboard; no exact current quota has been verified here. Vercel Hobby is limited to personal, non-commercial use, which is not determined solely by whether the site currently charges users. Record the actual Netlify project/domain after deployment. A verified local production build is not a claim that the hosted site is already online.
