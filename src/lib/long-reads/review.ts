import { expression, type LongRead } from "./content";

export const reviewLongRead: LongRead = {
  key: "code-review-long-v1",
  title: "把代码评审变成一次可执行的讨论",
  blocks: [
    [
      "# A code review that leads to a useful decision",
      "# 让代码评审真正推动一个决定",
    ],
    [
      "A developer opens a small pull request before lunch. It changes the default timeout for an internal client and updates two tests. By the afternoon, the discussion contains comments about naming, error handling, directory structure, and whether the whole client should be rewritten. The author no longer knows what is required before merging. This imagined review has plenty of attention but very little direction. A productive review needs more than people noticing things. It needs a shared understanding of the change, a clear distinction between different kinds of concern, and a practical route from disagreement to a decision.",
      "午饭前，开发者提交了一个小型拉取请求：修改内部客户端的默认超时，并更新两项测试。到了下午，讨论里出现了命名、错误处理、目录结构，甚至是否应该重写整个客户端的问题。作者已经不知道合并之前到底必须完成什么。这个设想的评审得到了很多关注，却缺少方向。有效的评审，不只是让大家发现问题；它需要共同理解这次变更，清楚区分不同类型的意见，并提供一条能从分歧走向决定的实际路径。",
    ],
    [
      "Start by understanding the problem the change is intended to solve. Read the description, inspect the relevant behavior, and identify the constraints the author is working within. A shorter timeout might reduce the time users spend waiting, but it might also cause slow yet successful operations to fail. Neither observation is enough on its own to approve or reject the change. The reviewer should ask what outcome matters and what evidence supports the proposed value. This turns the conversation from a competition between personal preferences into an investigation of the behavior the system is supposed to provide.",
      "首先理解这次变更要解决的问题。阅读说明，查看相关行为，并识别作者必须遵守的约束。较短的超时可能减少用户等待，却也可能让原本较慢但会成功的操作失败。仅凭任何一项观察，都不足以批准或否定修改。评审者应问清：什么结果最重要？有什么证据支持这个超时值？这样，讨论就会从个人偏好之间的较量，转向对系统应提供何种行为的共同调查。",
    ],
    [
      "A useful comment makes the consequence concrete. Instead of writing that a timeout looks wrong, describe a scenario in which the new value changes the result. For example, an existing caller may depend on a long-running report completing within the previous limit. Changing the default could introduce a breaking change even if the function signature stays the same. Explain the condition under which the problem occurs, and distinguish a confirmed behavior from a possibility that still needs investigation. Specific language makes it easier for the author to reproduce the concern and respond with evidence.",
      "有用的评论会说明具体后果。与其说超时值看起来不对，不如描述一个新值会改变结果的场景。例如，已有调用方可能依赖一份耗时较长的报告在旧限制内完成。即使函数签名没有变化，修改默认值仍可能 [[breaking|introduce a breaking change]]。要解释问题在什么条件下出现，并区分已经确认的行为，与仍需调查的可能性。具体的语言，能让作者更容易复现问题并用证据回应。",
    ],
    ["## Make uncertainty visible", "## 把不确定的地方说清楚"],
    [
      "When a requirement is unclear, ask for clarification before treating an assumption as a rule. A question such as whether callers can override the timeout may reveal a constraint that is missing from the description. It may also reveal that the reviewer has misunderstood the client. Questions work best when their purpose is visible: explain which decision depends on the answer. A vague question mark beside a line of code leaves the author to guess what information is wanted. Clear questions reduce that guessing and make it easier to discover that both people were reasoning from different premises.",
      "需求不明确时，应先 [[clarification|ask for clarification]]，不要把假设直接当成规则。比如，问清调用方能否覆盖默认超时，可能发现说明中遗漏的约束，也可能发现评审者误解了客户端的用法。提问时最好让目的清晰可见：说明哪个决定取决于这个答案。仅在代码旁留下一个模糊的问号，会让作者猜测你需要什么信息。清楚的问题可以减少猜测，也更容易让双方发现，原来各自的推理建立在不同前提上。",
    ],
    [
      "Separate blockers from suggestions so the author can prioritize their response. A bug that loses user input may prevent merging, while a preference for a different variable name may be optional. A proposed refactor can be valuable without being necessary for this particular fix. Teams can use short labels if they help, but labels are not a substitute for explaining the consequence. Marking something as critical does not establish why it is critical. The review should tell the author what must change, what could improve, and which observations are simply information for future work.",
      "要 [[blockers|Separate blockers from suggestions]]，这样作者才知道回应的优先级。会丢失用户输入的错误，可能必须在合并前修复；换一个变量名的偏好，则可能是可选建议。重构可能很有价值，却不一定是这次修复的必要条件。团队可以使用简短标签来辅助沟通，但标签不能替代对后果的说明。把某件事标成严重，并不能证明它为什么严重。评审应让作者知道：哪些必须改，哪些可以改进，哪些只是留给未来工作的参考信息。",
    ],
    [
      "The author has responsibilities too. A reply that says only done forces the reviewer to inspect the entire patch again and infer what changed. A short explanation can be much more helpful: the default remains unchanged, a new option allows the shorter timeout, and tests now cover both paths. When disagreeing, make a case for the chosen approach using the relevant constraints. Avoid defending the code as a personal possession. The aim is to decide whether the implementation serves the requirement, not to establish which person has greater authority over a particular line.",
      "作者同样有责任。只回复“改好了”，会迫使评审者再次检查整个补丁，并自行推断哪里发生了变化。简短说明通常更有帮助：默认行为保持不变，通过新选项允许更短超时，测试现在覆盖了两条流程。出现分歧时，应结合相关约束，[[case|make a case for]] 自己选择的方案。不要像捍卫私人物品一样捍卫代码。目标是判断实现是否满足需求，而不是确定谁对某一行代码拥有更高权威。",
    ],
    [
      "## Keep the discussion connected to the change",
      "## 让讨论始终围绕这次修改",
    ],
    [
      "Scope is a frequent source of friction. Once a reviewer notices a weak abstraction, it can be tempting to request a redesign before allowing a small fix through. Sometimes the redesign is necessary because the current structure makes the fix unsafe. In other cases, it only makes the review larger and delays a useful improvement. Keep the scope manageable by asking whether the additional work is required for the promised behavior. Record valuable unrelated ideas separately, with enough context that someone can evaluate them later. Deferring an idea is not the same as pretending it has no value.",
      "范围经常引发摩擦。评审者一旦发现抽象设计薄弱，可能就想要求先重构，再允许一个小修复合并。有时重构确有必要，因为当前结构让修复不安全；但有时它只会扩大评审，并推迟本来有用的改进。要通过判断额外工作是否是实现承诺行为所必需的，来 [[scope|Keep the scope manageable]]。有价值但无关的想法可以单独记录，并提供足够背景，供以后评估。推迟一个想法，并不等于否认它有价值。",
    ],
    [
      "Trade-offs deserve an explicit explanation. A shared helper may reduce duplicated code but make a simple call harder to follow. An extra retry may improve success during a brief outage but increase latency and load when the service is struggling. There is rarely a single metric that settles the whole decision. Describe what improves, what becomes more expensive, and which constraints make the balance acceptable. If the evidence is incomplete, propose a limited experiment or a measurement rather than inventing certainty. A good review can approve a reasonable choice while recording the conditions under which it should be reconsidered.",
      "[[tradeoffs|Trade-offs]] 值得被明确解释。共享辅助函数可能减少重复代码，却让简单调用更难理解；多一次重试可能改善短暂故障时的成功率，却在服务已经吃力时增加延迟与负载。通常没有某一个指标能单独决定整个问题。要说明哪些方面改善了，哪些变得更昂贵，以及什么约束使这种平衡可以接受。证据不完整时，可以提出小范围实验或测量，而不是装作确定。好的评审可以批准合理选择，同时记录在什么条件下应重新考虑它。",
    ],
    [
      "Tests should help the review answer behavioral questions. A test that fails without the patch and passes with it is useful when it represents the actual bug. A test that repeats the implementation step by step may only prove that two copies of the same idea agree. For the timeout change, useful cases might include the old default, the explicit shorter value, and a failure that preserves the caller's ability to recover. Do not add a large test suite merely to make a small patch look serious. Choose checks that protect a meaningful contract or address a genuine source of uncertainty.",
      "测试应帮助评审回答行为层面的问题。如果一个测试真实代表了原来的错误，那么补丁前失败、补丁后通过就很有价值。逐步照抄实现逻辑的测试，可能只证明同一个想法的两个副本彼此一致。对于超时修改，有用的场景可能包括旧默认值、显式设置的短超时，以及保留调用方恢复能力的失败情况。不要只是为了让小补丁看起来很认真，就增加庞大测试集；应选择保护重要契约，或解决真实不确定性的检查。",
    ],
    [
      "Small, well-organized changes are easier to review, but size alone is not the goal. Splitting one tightly coupled behavior across several incomplete pull requests can make each part misleading. A useful boundary leaves a coherent result that can be explained and tested. Within that boundary, separate mechanical changes from changes to behavior when practical, and point out generated files or repetitive edits. The reviewer should not have to search through formatting differences to discover the one condition that changes what users experience. Organization is valuable because it directs attention toward the decisions that matter.",
      "小而有条理的修改通常更容易评审，但小本身不是目标。把紧密耦合的一个行为拆成多个不完整请求，可能使每一部分都具有误导性。好的边界，应留下一个连贯、可解释、可测试的结果。在这个边界内，条件允许时，把机械性调整与行为变化分开，并指出生成文件或重复性编辑。评审者不应穿过大量格式差异，才能找到真正改变用户体验的那个条件。整理的价值，在于把注意力引向重要决定。",
    ],
    [
      "## Finish with a decision people can find",
      "## 用一个能被找到的明确决定收尾",
    ],
    [
      "Some discussions become inefficient in comments. If several replies repeat the same misunderstanding, a short conversation may resolve the issue more quickly. Afterward, write the conclusion back into the review, including the reason and any remaining action. Otherwise, the decision exists only in the memories of the people who attended. This matters for teammates in other time zones and for future maintainers who need to understand an unusual choice. Synchronous discussion can speed up understanding, while a written record makes that understanding available to everyone who depends on the code.",
      "有些讨论放在评论区会变得低效。如果多轮回复一直重复同一个误解，简短交流可能更快解决问题。但交流后，应把结论写回评审，包括理由和剩余行动；否则，决定就只存在于参与者的记忆中。这对不同时区的同事，以及日后需要理解特殊选择的维护者都很重要。同步交流可以加快理解，书面记录则让所有依赖这段代码的人都能获得这种理解。",
    ],
    [
      "A follow-up change should have an owner or a clear place in the team's backlog. Saying that something will be fixed later is easy; making later discoverable is more useful. Describe the unresolved problem, explain why it does not block the current change, and preserve any evidence already gathered. Avoid creating a task that merely says clean this up, because the next person will have to repeat the investigation. At the same time, do not turn every optional suggestion into mandatory future work. The team still needs to decide whether the expected benefit justifies the cost.",
      "一项 [[followup|follow-up change]] 应当有负责人，或在团队待办列表中有清楚的位置。说以后修很容易，让“以后”能够被找到更有用。应描述未解决的问题，解释它为什么不阻塞当前修改，并保存已经收集的证据。不要只建一个写着“清理一下”的任务，否则接手的人还得重做调查。同时，也不要把每条可选建议都变成强制的未来工作；团队仍需判断预期收益是否值得相应成本。",
    ],
    [
      "Before merging, close the loop on the important comments. Confirm which concerns were addressed, which suggestions were declined with a reason, and which issues were recorded for later. Run the checks appropriate to the final version, especially if resolving a discussion changed the behavior again. Approval is not a claim that the code can never fail. It is a judgment that the remaining uncertainty and risk are acceptable for this change. Clear ownership of that judgment is more useful than collecting several approvals from people who each assume somebody else checked the critical part.",
      "合并之前，要对重要评论 [[loop|close the loop]]：确认哪些问题已经处理，哪些建议有理由地没有采纳，哪些事项留待以后。运行适合最终版本的检查，尤其是在讨论结束后又改变了行为的情况下。批准并不等于宣称代码永远不会失败，而是在判断这次变更剩余的不确定性与风险是否可以接受。明确谁作出了这个判断，比收集多个批准、但每个人都以为关键部分由别人检查了，更有价值。",
    ],
    [
      "The best result is not a review with no disagreement. It is a change whose purpose, behavior, and limitations are clearer after the discussion than before it. The author learns which assumptions need explanation, and the reviewer gains a more accurate picture of the problem. Future readers can follow the reasoning without reconstructing a private argument. In the timeout example, the final patch may still be small. What has improved is the quality of the decision around it, which makes the code easier to maintain and the next review easier to begin.",
      "最好的结果，不是评审中毫无分歧，而是讨论之后，这次修改的目的、行为和限制都比之前更清楚。作者知道哪些假设需要解释，评审者也获得了更准确的问题图景。后续读者能够沿着推理理解代码，不必重建一场私下争论。在超时这个例子里，最终补丁可能仍然很小；改善的是围绕它作出决定的质量，这会让代码更容易维护，也让下一次评审更容易开始。",
    ],
  ],
  terms: [
    expression(
      "breaking",
      "introduce a breaking change",
      "引入不兼容变更",
      "Changing the default could introduce a breaking change even if the function signature stays the same.",
      "即使函数签名不变，修改默认值也可能引入不兼容变更。",
      "could 表示可能；even if 引出容易被忽略的条件。",
      "technical",
    ),
    expression(
      "clarification",
      "ask for clarification",
      "请求澄清",
      "When a requirement is unclear, ask for clarification before treating an assumption as a rule.",
      "需求不明确时，先请求澄清，不要把假设当规则。",
      "适用于需求、任务边界、接口约定等需要进一步解释的场景。",
    ),
    expression(
      "blockers",
      "separate blockers from suggestions",
      "区分阻塞问题与一般建议",
      "Separate blockers from suggestions so the author can prioritize their response.",
      "区分阻塞问题与建议，帮助作者安排回应顺序。",
      "blocker 指必须先解决才能推进的问题，不是所有意见都是 blocker。",
    ),
    expression(
      "case",
      "make a case for",
      "提出支持某个方案的理由",
      "When disagreeing, make a case for the chosen approach using the relevant constraints.",
      "出现分歧时，结合相关约束说明为什么选择这个方案。",
      "case 在这里表示论据，不是代码里的分支或测试用例。",
    ),
    expression(
      "scope",
      "keep the scope manageable",
      "将范围控制在可处理的程度",
      "Keep the scope manageable by asking whether the additional work is required for the promised behavior.",
      "判断额外工作是否是承诺行为所必需的，以控制范围。",
      "manageable 表示可管理、可处理；不等于忽略必须修复的问题。",
    ),
    expression(
      "tradeoffs",
      "trade-offs",
      "为了得到某些好处而接受的代价",
      "Trade-offs deserve an explicit explanation.",
      "取舍值得明确解释。",
      "说明收益与成本之间的平衡，技术方案讨论中很常用。",
    ),
    expression(
      "followup",
      "follow-up change",
      "接下来单独完成的修改",
      "A follow-up change should have an owner or a clear place in the team's backlog.",
      "后续修改应当有负责人，或在团队待办列表中有明确位置。",
      "follow-up 作定语，表示在当前工作之后继续跟进。",
    ),
    expression(
      "loop",
      "close the loop",
      "确认处理结果，让讨论有明确收尾",
      "Before merging, close the loop on the important comments.",
      "合并前，为重要评论补齐处理结论。",
      "工作沟通常用表达；这里是回复并确认结论，不是关闭程序循环。",
    ),
  ],
};
