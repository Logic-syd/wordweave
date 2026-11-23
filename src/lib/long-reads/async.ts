import { expression, type LongRead } from "./content";

const example =
  "```ts\nlet latest = 0;\nasync function search(query: string) {\n  const requestId = ++latest;\n  const response = await fetch('/search?q=' + encodeURIComponent(query));\n  if (!response.ok) throw new Error('Search failed');\n  const results = await response.json();\n  if (requestId === latest) showResults(results);\n}\n```";

export const asyncLongRead: LongRead = {
  key: "async-search-long-v1",
  title: "搜索结果为什么会倒退：设计可靠的异步界面",
  blocks: [
    ["# When search results go backwards", "# 搜索结果为什么会倒退"],
    [
      "A reader types a book title into a search box, corrects one letter, and sees the right results for a moment. Then the old results suddenly return. Nothing unusual appears in the server logs: both requests succeeded, both responses contained valid data, and neither operation took an unreasonable amount of time. The mistake is in the relationship between those successful operations. In this imagined application, the interface accepts whichever response arrives last, even when that response belongs to an earlier query. To understand the bug, we need to separate the order of user actions from the order in which the network finishes its work.",
      "读者在搜索框里输入书名，改正一个字母后，正确的结果短暂出现，接着旧结果突然又回来了。服务器日志没有异常：两次请求都成功了，响应数据有效，耗时也没有离谱之处。错误出在这些成功操作之间的关系。在这个设想的应用中，界面接受最后到达的响应，哪怕它属于更早的搜索词。要理解这个问题，就需要把用户操作的顺序，与网络完成工作的顺序区分开。",
    ],
    [
      "Consider a request for a broad title and a second request for a more specific one. The first may require a slower database query, while the second may find its result in a cache. Several requests can be in flight at the same time. Their starting order therefore tells us very little about their completion order. A fast laptop and a local server can hide this problem during development because the responses often arrive quickly and predictably. Testing with deliberately varied delays makes the hidden assumption visible: the code has treated network timing as if it were a reliable expression of the user's intention.",
      "假设第一次请求使用较宽泛的书名，第二次则更具体。前者可能需要较慢的数据库查询，后者却可能直接命中缓存。多个请求可以同时 [[flight|in flight]]，因此开始的先后顺序，并不能可靠地说明完成的顺序。开发时，快速的电脑和本地服务器可能掩盖问题，因为响应通常很快，顺序也容易预测。刻意设置不同延迟进行测试，就能揭示这个隐含假设：代码把网络时序当成了用户意图的可靠表达。",
    ],
    [
      "First decide what the screen promises. In a simple search interface, the visible results should usually correspond to the latest query the user submitted. This is a product rule, not a universal rule for all asynchronous work. A file upload screen may need to show every completed upload, and a payment history should not discard an earlier payment merely because another one started later. Write down the rule for the particular operation. Once that rule is clear, the implementation can choose whether to replace an earlier result, accumulate results, or keep independent state for several tasks.",
      "先决定页面向用户承诺什么。简单的搜索界面里，可见结果通常应当对应用户最近一次提交的搜索词。这是一条产品规则，并不是所有异步任务都应遵循的通用规则。文件上传页面可能需要展示每个已完成的上传；支付历史也不应仅因为后发起了另一笔支付，就丢弃较早的一笔。应先写清当前操作的规则。规则明确后，实现才能决定是替换旧结果、累积结果，还是为多个任务分别维护状态。",
    ],
    ["## Give each operation an identity", "## 给每次操作一个明确身份"],
    [
      "For search, one straightforward technique is to assign a sequence number to each request. Increment a counter when starting an operation and capture that number locally. Before applying the response, check whether its number is still the latest one. Ignore a response that has been superseded by a newer request. This protects the display even if an old response arrives late. The number identifies an operation rather than a search string, which matters when the user submits the same query twice and the underlying data may have changed between submissions.",
      "对于搜索，一种直接做法是给每次请求分配序号：启动操作时递增计数器，并把序号保存在该操作的局部变量中。应用响应之前，检查它是否仍然是最新序号。对于已经 [[superseded|superseded by a newer request]] 的响应，就忽略它。这样，旧响应即使较晚抵达，也不会覆盖页面。序号标识的是一次操作，而不是搜索字符串；当用户连续提交相同搜索词、但底层数据可能已经变化时，这一区别很重要。",
    ],
    [example, example],
    [
      "The example deliberately leaves out several concerns so that the ordering rule is easy to see. It does not define a loading indicator, an error message, or what should happen when the input becomes empty. A complete implementation must apply the same identity check to those state changes too. Otherwise, an older failed request could replace a newer successful result with an error, or its cleanup could remove the loading indicator for a request that is still running. Correct result ordering is only one part of keeping the screen consistent with the latest operation.",
      "这个例子刻意省略了一些问题，让顺序规则更容易看清：它没有定义加载提示、错误消息，也没有说明输入清空时怎么办。完整实现必须对这些状态变化应用相同的身份检查。否则，旧请求的失败仍可能用错误提示覆盖新请求的成功结果，或者它的清理逻辑提前移除仍在运行的新请求的加载提示。正确排列结果，只是让整个页面与最新操作保持一致的一部分。",
    ],
    [
      "Cancellation can complement this check, but it has a different job. An AbortController can stop a fetch operation from continuing in the client when its result is no longer needed. It may save work and help release resources, yet it is not a promise that the server has undone everything. The server may already have received the request or committed a change before the cancellation was observed. For that reason, cancellation is not a rollback mechanism. Use it to manage unwanted work, and keep a separate rule deciding which results are allowed to change the interface.",
      "取消操作可以配合身份检查，但两者职责不同。结果不再需要时，AbortController 可以停止客户端继续执行 fetch 请求，这可能节省工作并释放资源，却不保证服务器撤销了全部操作。服务器可能在观察到取消之前，就已经收到请求，甚至提交了修改。因此，取消并不是 [[rollback|rollback mechanism]]。应当用它管理不再需要的工作，同时保留一条独立规则，决定哪些结果有权修改界面。",
    ],
    [
      "Debouncing solves yet another problem. Instead of sending a request after every keystroke, the interface waits briefly for typing to pause. This can reduce unnecessary requests and avoid repeatedly replacing the results while a person is still composing a word. However, a pause does not guarantee that the previous request has finished, so debouncing does not eliminate response races. The delay also has a usability cost: a long wait can make a quick interface feel slow. Choose the delay based on the interaction, and consider an explicit submit action for searches that are expensive or require several fields.",
      "[[debounce|Debouncing]] 解决的又是另一个问题：界面不在每次按键后立即请求，而是等输入短暂停顿，再发送请求。这可以减少不必要的调用，也能避免用户还在拼写一个词时，结果区就被反复替换。但输入停顿不保证前一次请求已经结束，所以防抖并不能消除响应之间的竞态。延迟也有体验成本：等得太久，会让本来很快的界面显得迟缓。应根据交互选择等待时间；对于昂贵查询或需要多个字段的搜索，可以考虑明确的提交操作。",
    ],
    [
      "## Design the waiting and failure states",
      "## 把等待和失败也当成界面的一部分",
    ],
    [
      "A useful loading state answers a small set of questions. Is the current input being searched? Do the visible results belong to an earlier query? Can the user still edit the input? Keeping the previous results visible can reduce visual disruption, but the relationship to the new query must remain clear. Alternatively, a compact loading placeholder may be easier to understand. Neither choice is always correct. What matters is that the interface does not silently present old information as a confirmed answer to the latest question, especially when users may make an important decision from the result.",
      "有用的加载状态应该回答几个具体问题：系统正在搜索当前输入吗？可见结果是不是属于之前的搜索词？用户还能继续编辑吗？保留旧结果可以减少画面跳动，但必须说明它们与新搜索词之间的关系。另一种选择是显示紧凑的加载占位，它可能更容易理解。两种方式都不是永远正确的。重要的是，不要悄悄把旧信息当作最新问题已经确认的答案，尤其是在用户可能据此作出重要决定时。",
    ],
    [
      "Treat expected cancellation separately from an unexpected failure. If a user types another letter and the old search is canceled, showing a red error banner would describe a normal interaction as a broken system. A genuine network failure deserves a different message, ideally one that keeps the input and explains a useful next step. Authentication failures, request limits, and an unavailable service may also need different responses. Avoid copying arbitrary server error text directly into the page. It may contain internal details, and it usually explains less than a short message written for the person using the application.",
      "应当 [[separately|Treat expected cancellation separately from an unexpected failure]]。如果用户又输入了一个字母，旧搜索随之取消，红色错误横幅就会把正常交互描述成系统故障。真正的网络故障需要不同提示，最好保留输入，并说明用户下一步能做什么。鉴权失败、请求限流与服务不可用，也可能需要不同回应。不要把服务器返回的任意错误文本直接复制到页面上：它可能包含内部细节，而且通常不如专门为用户写的一句简短说明清楚。",
    ],
    [
      "Retries should be bounded and appropriate to the operation. Repeating a read-only search after a brief connection problem is often less risky than repeating a request that creates an order. Even a search retry should stop after a small number of attempts and should not continue after a newer query has replaced it. A server-provided waiting period may help with temporary rate limits, but waiting forever is not a recovery strategy. Keep the user in control of a final retry, and do not turn one click into an unbounded series of requests that quietly consumes time or paid API credit.",
      "重试应当有明确上限，并符合操作性质。短暂连接问题后重复只读搜索，通常比重复创建订单的请求风险更低。即使是搜索，也应在少量尝试后停止；较新的搜索词替代它之后，更不应继续。服务端提供的等待时间，可能有助于处理暂时限流，但无限等待不是恢复策略。应让用户决定是否最终再试一次，不要把一次点击变成 [[unbounded|unbounded series of requests]]，悄悄消耗时间或付费 API 额度。",
    ],
    [
      "A timeout is a limit on how long the client is willing to wait, not proof that the operation never happened. If the connection drops after the server has changed data but before the response arrives, the client may be uncertain about the outcome. Operations with side effects need a deliberate strategy for this uncertainty, such as an idempotency key and a way to check the recorded result. The details depend on the server contract. Adding a timeout to the browser improves responsiveness, but it does not by itself make a repeated write safe.",
      "超时表示客户端只愿意等这么久，不能证明操作根本没有发生。如果服务器已经修改数据，但响应到达之前连接断开，客户端可能无法确定结果。带副作用的操作需要专门处理这种不确定性，例如使用 [[idempotency|idempotency key]]，并提供查询已记录结果的方式。具体做法取决于服务端契约。在浏览器里增加超时可以改善响应体验，但仅靠超时本身，并不能让重复写入变得安全。",
    ],
    [
      "## Test the schedule, not only the response",
      "## 测试时序，而不仅是响应内容",
    ],
    [
      "A convincing test should control when each request settles. Start two searches, complete the newer one first, and then resolve the older one with a different result. The page should still show the newer result. Repeat the scenario with the older request failing, and verify that the new result is not replaced by an error. Also test clearing the input while a request is pending, leaving the page, and receiving an empty result. These cases explore the operation's lifecycle instead of assuming that the happy path is representative of everything the network can do.",
      "有说服力的测试应该控制每个请求何时结束。先发起两次搜索，让较新的请求先完成，然后让较旧的请求返回不同结果；页面仍应显示新的结果。再让旧请求失败，检查新结果不会被错误提示替换。还应测试：请求未完成时清空输入、离开页面，以及得到空结果。这些情况覆盖了操作的生命周期，而不是假定 [[happy|happy path]] 能代表网络可能出现的全部行为。",
    ],
    [
      "Accessibility benefits from the same clear model. Preserve keyboard focus while results change, give the result region a meaningful label, and communicate an important loading or failure status without announcing every keystroke. If selecting a result moves the user somewhere else, make that action predictable. A developer can verify much of this with keyboard navigation and a screen reader, rather than relying only on a visual screenshot. The purpose of asynchronous work is to keep the interface responsive; a technically correct update that disorients the person using it still needs improvement.",
      "无障碍体验也受益于同样清晰的模型：结果变化时保留键盘焦点，为结果区域设置有意义的标签，并传达重要的加载或失败状态，而不是每次按键都播报。如果选择结果会把用户带到别处，就应让这种动作符合预期。开发者可以通过键盘导航和屏幕阅读器验证其中很多行为，而不只依赖截图。异步操作的目的是保持界面响应；即使一次更新在技术上正确，若它让用户失去方向感，仍然需要改进。",
    ],
    [
      "The search bug is resolved when the interface follows an explicit rule about ownership of the result. Sequence checks establish which operation is current, cancellation manages unnecessary work, debouncing controls request frequency, and error handling explains outcomes the user can act on. These tools complement one another because they solve different problems. Keep their responsibilities visible in the code and in the review description. The next developer should be able to explain why an old response is ignored without reconstructing a lucky sequence of timers or assuming that the network usually behaves nicely.",
      "当界面遵循明确的结果归属规则时，搜索倒退的问题才算得到解决。序号检查确定哪次操作仍然有效，取消机制管理不需要的工作，防抖控制请求频率，错误处理则把结果说明成用户能够采取行动的信息。这些工具相互配合，是因为它们解决的是不同问题。应该在代码与评审说明中清晰呈现各自职责。下一位开发者应当能解释旧响应为什么被忽略，而不必重建一组碰巧有效的定时器顺序，或假设网络通常会乖乖按预期工作。",
    ],
    [
      "Further reading: [MDN — AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).",
      "延伸阅读：[MDN — AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)。",
    ],
  ],
  terms: [
    expression(
      "flight",
      "in flight",
      "正在进行，尚未完成",
      "Several requests can be in flight at the same time.",
      "多个请求可以同时处于进行中。",
      "常用来描述已发出、尚未完成的请求或任务。",
    ),
    expression(
      "superseded",
      "superseded by a newer request",
      "被更新的请求取代",
      "Ignore a response that has been superseded by a newer request.",
      "忽略已被更新请求取代的响应。",
      "be superseded by 表示某物因后来的版本或决定而不再适用。",
    ),
    expression(
      "rollback",
      "rollback mechanism",
      "将已完成修改撤回的回滚机制",
      "For that reason, cancellation is not a rollback mechanism.",
      "因此，取消并不是回滚机制。",
      "原句的 not 是关键限制：停止等待与撤销服务端修改是不同的事。",
      "technical",
    ),
    expression(
      "debounce",
      "debouncing",
      "输入暂停一段时间后再执行的防抖处理",
      "Debouncing solves yet another problem.",
      "防抖解决的又是另一个问题。",
      "减少触发频率，不等于确保响应按照发出顺序返回。",
      "technical",
    ),
    expression(
      "separately",
      "treat A separately from B",
      "把两类情况分开处理",
      "Treat expected cancellation separately from an unexpected failure.",
      "把预期内的取消与意外失败分开处理。",
      "treat A separately from B 可迁移到错误类型、需求类别等讨论中。",
    ),
    expression(
      "unbounded",
      "unbounded series of requests",
      "没有明确次数上限的一连串请求",
      "Keep the user in control of a final retry, and do not turn one click into an unbounded series of requests that quietly consumes time or paid API credit.",
      "让用户决定最终是否重试，不要把一次点击变成悄悄消耗时间或 API 额度的无限请求。",
      "unbounded 表示没有上限；这里强调重试需要明确停止条件。",
    ),
    expression(
      "idempotency",
      "idempotency key",
      "用于识别同一操作重试的幂等键",
      "Operations with side effects need a deliberate strategy for this uncertainty, such as an idempotency key and a way to check the recorded result.",
      "有副作用的操作需要专门处理结果不确定性，例如幂等键和查询记录结果的方式。",
      "服务端必须定义并落实键的语义；仅在客户端生成一个键不够。",
      "technical",
    ),
    expression(
      "happy",
      "happy path",
      "输入与依赖都正常时的成功流程",
      "These cases explore the operation's lifecycle instead of assuming that the happy path is representative of everything the network can do.",
      "这些情况覆盖操作生命周期，而不是假定成功流程能代表全部网络行为。",
      "测试讨论中常与 error paths、edge cases 等表达一起使用。",
      "technical",
    ),
  ],
};
