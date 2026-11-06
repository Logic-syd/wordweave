# 学习材料模型对照测试

用同一份 React/TypeScript 英文和一篇 A2 德语导入短文检验网站生成器。每篇都有三个 Markdown 块。两家使用相同的原文、提示词、词汇上下文和结构校验，按供应商支持的参数发请求。脚本直接调用网站的 `parseSource`、`generateTranslated` 和 `validateArticleOutput`（含 `validateTargets`），在内存里处理材料，无需启动网站或 PostgreSQL。

## 运行

使用仓库指定的 Node 24。在仓库根目录首次准备依赖并运行免费预检。

```sh
npm ci
npm run db:generate
npm run eval:materials
```

预检用人工编写的固定响应分别检查两家的请求和两篇材料。报告显示 `mode: "offline"`、`liveRequests: 0`，可与实测报告区分。参考答案只在离线模式进入响应，真实请求只发送原文、提示词和设置。

**真实测试**。让当前进程能读取获赠额度的 OpenAI 组织项目的 `OPENAI_API_KEY`，然后运行第一条命令。可使用环境中已有的凭据，或由本机已忽略的 `.env.eval.local` 提供。对照 DeepSeek 时单独运行第二条，使用 `DEEPSEEK_API_KEY` 和 DeepSeek 自己的余额。也支持项目原有的 `LLM_API_KEY`，仅当其 `LLM_BASE_URL` 与所选供应商的下表地址完全对应时才会采用。

```sh
npm run eval:materials -- openai
npm run eval:materials -- deepseek
```

| 供应商 | 服务地址 | 指定模型 | 请求参数 |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.4-mini-2026-03-17` | `max_completion_tokens=3072`、`reasoning_effort=none`、标准服务层级、默认采样 |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-flash` | `max_tokens=3072`、`thinking.type=disabled`、`temperature=0.5` |

每次命令最多发送两次模型请求，每篇一次，禁用重试。JSON 对象返回后，再由 Zod 和应用校验器检查字段、段落顺序、Markdown 保护标记、词条映射和原句。脚本本地限制请求大小并固定服务地址。缺少对应凭据会在发送前退出。鉴权、模型不可用和限流错误会停止本轮后续请求。

## 查看结果与成本

命令行给出本次 JSON 报告的路径，位于已被 Git 忽略的 `.local/model-eval/`。每次运行单独保存。核对相同样文的 `cases`，先看 `acceptedByGenerator` 和 `checks`，再读 `result.paragraphs` 与 `result.terms`。每次尝试单独保留返回的模型名、状态、原始模型文本、耗时及 `usage`。输出不合格仍记录已返回的 token。网络中断等情况缺少计量信息时，费用显示 `null`。HTTP 错误不保存原始错误正文或请求头。

费用为根据供应商实际返回的 token 和 2026-11-06 公开标准费率计算的美元估值。OpenAI 的普通输入、缓存输入和输出每百万 token 分别为 $0.75、$0.075 和 $4.50。两次调用若各占满 3,072 输出 token，输出合计 $0.027648。以输入上限每次 16,384 token 保守估算，两篇合计约 $0.0522。DeepSeek Flash 根据高峰与非高峰费率给出区间。实际抵扣金额以相应组织账单为准。[OpenAI 模型与定价](https://developers.openai.com/api/docs/models/gpt-5.4-mini) · [JSON 模式](https://developers.openai.com/api/docs/guides/structured-outputs) · [DeepSeek 定价](https://api-docs.deepseek.com/quick_start/pricing/)

## 逐项复核

| 项目 | 英文技术文章 | A2 德语短文 |
| --- | --- | --- |
| 段落 | 两段正文顺序一致，行内 `setCount`、链接和围栏代码逐字保留 | 三段原文、学习版和每张词卡的完整引句逐段对应 |
| 选词 | 是否选到可在工作中复用的搭配，是否把一句话拆成零散单词或单独选 React | 明确指定 Fahrkarte 与 abfahren，另外一个目标由模型选。检查它在这篇 A2 故事里是否值得学 |
| 中文 | 保留“直到事件处理函数结束”“当前渲染值不会改变”和“下一个值依赖前一个值”的条件。TypeScript 推断参数类型 | 对照买票、等晚点火车、给朋友看车票三个动作，检查释义和例句译文 |
| 语法 | 解释表达在原句中的作用，保留否定和条件 | `die Fahrkarte / die Fahrkarten`；`Der Zug fährt um zehn Uhr ab.` 的分离动词；若讲到 `auf den Zug warten`，宾语用第四格，`weil` 从句里的 `kommt` 在句末 |

每篇报告都有相应的 `manualReview` 对照点。汉字检测与字段格式无法判断解释是否贴合语境。比较两家时，逐项摘出实际输出和对应的原句，可标记为通过、部分通过或失败。

## 本轮结果与已有 DeepSeek 证据

2026-11-06 的本轮预检中，两种请求格式与两份固定响应的四个组合均通过。英文样文的三块逐段对应，受保护的代码与链接保留；德语样文的三段和三张词卡均通过校验。两家实测入口都在凭据检查处停止。发送到供应商的请求为 0，本轮 API 费用为 $0.00。这里的词卡数量来自人工夹具。

基线提交 `933987e` 的 README 记录真实 DeepSeek 曾完成模型发现和短文转换，并保留行内代码与围栏代码。该记录没有附这两篇相同输入的模型输出、词卡、token 或费用。仓库中的公开范文和测试夹具都是固定材料。由此可以确认过往验证过的功能，语言质量与同文成本需要两份实测报告才能比较。[原始验证记录](https://github.com/Logic-syd/wordweave/blob/933987e3f8f675e957f929254a824847a0c9f14c/README.md#L181)
