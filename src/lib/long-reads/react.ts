import { expression, type LongRead } from "./content";

const updates =
  "```tsx\nfunction addTwo() {\n  setCount(previous => previous + 1);\n  setCount(previous => previous + 1);\n}\n```";

export const reactLongRead: LongRead = {
  key: "react-state-long-v1",
  title: "一次点击之后：从 React 状态快照到可靠界面",
  blocks: [
    ["# What happens after a click", "# 一次点击之后，界面经历了什么"],
    [
      "Imagine a small shopping application with a button that adds two tickets to a basket. A developer calls the state setter twice, expecting the count to rise by two, but the interface shows only one extra ticket. The first response is often to blame the framework or add a timer. Before changing the code, it helps to reason about the sequence of events. What value did the handler read? What updates did it request? What did the next render receive? These questions turn a surprising result into a problem that can be explained and tested.",
      "设想一个购物应用，按钮每次应往购物篮里加入两张票。开发者调用了两次状态设置函数，预期数量增加二，界面却只多了一张。第一反应往往是怪框架，或者加个定时器。但修改代码之前，先 [[reason|reason about]] 事件发生的顺序会更有帮助：处理函数读取的值是什么？它请求了哪些更新？下一次渲染拿到了什么？这些问题能把一个令人意外的结果，转化成可以解释和测试的问题。",
    ],
    [
      "A useful starting point is that each render receives a snapshot of the state. The variables inside that render describe the information available at that moment. An event handler created during the render keeps access to those values. Calling a setter requests an update; it does not rewrite the local variables in the handler that is already running. If the count was zero when the handler was created, reading that variable again after requesting an update still gives zero within that invocation. This is ordinary closure behavior combined with React's rendering model, rather than evidence that the setter has failed.",
      "一个有用的起点是：每次渲染接收的都是 [[snapshot|snapshot of the state]]。本次渲染中的变量描述的是当时可用的信息；在这次渲染中创建的事件处理函数，也保留着对这些值的访问。调用设置函数是在请求更新，并不会改写正在运行的处理函数里的局部变量。如果处理函数创建时数量是零，那么在本次调用中，请求更新后再次读取那个变量，得到的仍是零。这是闭包行为与 React 渲染模型共同作用的结果，不能据此断定设置函数失效了。",
    ],
    [
      "Now consider two requests that both say, in effect, replace the count with the old count plus one. When both requests use the same captured value, both describe the same replacement. They do not automatically mean increment whatever value happens to be current at execution time. React can batch related updates before rendering the result, which avoids showing every intermediate step. The exact batching opportunities depend on the environment and React version, but the important distinction remains the same: a replacement value and a calculation based on the pending state express different intentions.",
      "再看两次更新请求：它们实际表达的都是“把数量替换为旧数量加一”。如果两次请求使用了同一个捕获值，它们描述的就是同一个替换结果，并不自动意味着“执行时取当时的最新值再加一”。React 可以将相关更新批量处理，再渲染结果，避免显示每一个中间步骤。具体能在哪些情况下批处理，取决于运行环境和 React 版本；但关键区别不变：给出一个替换值，与根据待处理状态进行计算，表达的是不同意图。",
    ],
    ["## Express the update you actually mean", "## 把真正想要的更新表达出来"],
    [
      "Use an updater function when the next value depends on the previous value. Instead of supplying a finished number, supply a function that receives the pending state and returns the next state. Two increment functions can then be applied in order, so the second one works with the result of the first. This does not make every setter call immediately observable in the current handler. It simply gives React the information needed to calculate the next state correctly. The following example assumes that the component already owns a numeric count state and its setter.",
      "当下一个值 [[previous|depends on the previous value]] 时，可以使用更新函数。你不再直接提供一个计算完毕的数字，而是提供一个接收待处理状态、返回下一状态的函数。这样，两次递增函数就能按顺序应用，第二次使用第一次的结果。这并不会让当前事件处理函数立即读到每一次状态变化；它只是把正确计算下一状态所需的信息交给 React。下面的例子假设组件已经拥有数值型的 count 状态及对应设置函数。",
    ],
    [updates, updates],
    [
      "Updater functions should remain pure. They should calculate a value without charging a card, sending a message, or changing an object outside the function. Development checks may invoke an updater more than once to help reveal accidental impurities, so a hidden side effect can become especially confusing. Even without those checks, rendering calculations are a poor place to initiate an irreversible action. Put a user-triggered request in the relevant event flow, and design the server operation to tolerate retries where necessary. State calculation and external work have different responsibilities, even when they originate from the same click.",
      "更新函数应当保持纯粹：计算一个值，而不是扣款、发消息，或修改函数外部的对象。开发环境的检查可能多次调用更新函数，帮助发现意外的不纯操作，因此藏在其中的副作用会格外令人困惑。即使没有这些检查，在渲染计算里发起不可逆操作也不合适。由用户触发的请求应放在相应的事件流程中；必要时，服务端操作还应能够容忍重试。状态计算与外部操作承担的职责不同，即使它们都源自同一次点击。",
    ],
    [
      "It is also important to distinguish one event from several separate user actions. A rapid double click is not necessarily equivalent to two updates issued inside one handler. A submit button may need a clear pending state, and the application may need to prevent a second submission until the first one finishes. A state update alone is not a complete payment or booking safeguard. The server must enforce the relevant business rules as well. Thinking about the boundary of the operation prevents a local rendering fix from being mistaken for a guarantee about the whole system.",
      "还要区分一次事件与多次独立的用户操作。快速双击，并不一定等价于在一个处理函数中发出两次更新。提交按钮可能需要清晰的等待状态；应用也可能需要在第一次提交结束之前阻止第二次提交。仅仅更新前端状态，并不能构成支付或订票的完整保护措施，服务器同样必须落实相关业务规则。明确一次操作的边界，才能避免把局部的渲染修复，误认为对整个系统行为的保证。",
    ],
    [
      "Asynchronous work adds another layer. A callback that runs after a request finishes may still refer to values captured before the request began. A stale closure can make an otherwise reasonable calculation use an outdated value. Sometimes the callback should use that earlier value because it belongs to the action the user started. Sometimes it should apply an update to the latest pending state instead. Decide which meaning is correct before reaching for a ref or changing an effect dependency. A newer value is not automatically the right value for every operation.",
      "异步任务又增加了一层复杂性：请求完成后执行的回调，可能仍然引用请求开始之前捕获的值。[[closure|stale closure]] 会让一个看似合理的计算使用已经过时的数据。有时，回调本来就应该使用较早的值，因为它属于用户当时发起的那次操作；另一些时候，它应当基于最新的待处理状态更新。使用 ref 或修改 effect 依赖之前，应先决定哪一种含义才是正确的。更新的值，并不自动等于每一次操作都需要的值。",
    ],
    [
      "## Keep state small enough to understand",
      "## 让状态保持在容易理解的范围内",
    ],
    [
      "Many state bugs begin with information being stored twice. Suppose a basket stores the selected items, their count, and a formatted sentence announcing that count. Every edit now has several opportunities to leave those values out of sync. Prefer a single source of truth when the other values can be derived cheaply and reliably. The sentence can be calculated during rendering, and the count may come from the items themselves. This does not mean that all derived values must always be recomputed; it means duplicated state needs a reason stronger than the convenience of adding another variable.",
      "许多状态问题源于同一份信息被存了两遍。假设购物篮同时保存所选商品、商品数量，以及一条显示数量的格式化句子。每次编辑都会出现多个让它们失去同步的机会。如果其他值可以低成本、可靠地推导出来，优先保留 [[truth|single source of truth]]：显示用的句子可以在渲染时计算，数量也可能直接来自商品列表。这并不是说所有派生值都必须始终重新计算，而是说，重复存储状态需要比“再加一个变量很方便”更充分的理由。",
    ],
    [
      "Objects introduce a related trap. Mutating an existing state object changes information that older renders may still reference, and passing the same object back can prevent the intended update from being recognized. Create a new object or array for the changed structure, and preserve the parts that have not changed. Remember that copying an array is shallow: the objects inside it are still shared unless you replace them too. A small update helper can make these operations easier to review, but a helper does not remove the need to understand which references are shared.",
      "对象还会带来一个相关陷阱。直接修改已有的状态对象，会改变旧渲染可能仍在引用的信息；把同一个对象再传回去，还可能导致预期的更新没有被识别。应该为发生变化的结构创建新的对象或数组，同时保留未改变的部分。要记住，复制数组是浅复制：里面的对象仍然共享，除非你也替换它们。小型更新辅助函数能让操作更容易评审，但辅助函数不能替代对共享引用的理解。",
    ],
    [
      "Where state lives matters as much as how it changes. A temporary input value may belong to the component that edits it, while a selection used by several siblings may belong to their nearest appropriate shared owner. Moving everything to the top makes data available, but it can also make relationships harder to follow. Move state only as far as the actual coordination requires. When a component is intentionally replaced, its local state may reset; when the same component identity is preserved, that state may remain. Make those choices deliberately, especially in forms where losing a draft is costly.",
      "状态放在哪里，与它怎样变化同样重要。临时输入值可能适合由编辑它的组件持有；多个兄弟组件共用的选择结果，则可能属于它们最近且合适的共同上层。把所有状态搬到最顶层，虽然能让数据到处可用，也可能使关系更难追踪。状态只应提升到实际协作所需的位置。组件被有意替换时，局部状态可能重置；组件身份得以保留时，状态则可能继续存在。要主动做出这些选择，尤其是在丢失草稿代价很高的表单中。",
    ],
    [
      "Performance work should start with an observed problem. A component can render without causing a visible change to every part of the page, and not every extra render is expensive. It is reasonable to avoid unnecessary re-renders, but first identify where the time is actually spent. A costly calculation, a large list, a network delay, and a layout problem require different fixes. Memoization may help in a suitable case, but it adds conditions that future maintainers must understand. Measure the important interaction again after changing it, using a production-like build and a representative device where possible.",
      "性能优化应从已经观察到的问题开始。组件发生一次渲染，并不意味着页面每个部分都出现可见变化，也不是每一次额外渲染都很昂贵。希望 [[avoid|avoid unnecessary re-renders]] 很合理，但应先找出时间究竟花在哪里。昂贵计算、大列表、网络延迟与布局问题，需要不同的解决办法。在合适的场景中，记忆化可能有用，但也会增加后续维护者需要理解的条件。修改之后，应再次测量关键交互；条件允许时，使用接近生产环境的构建和有代表性的设备。",
    ],
    [
      "## Turn the explanation into a reliable change",
      "## 把理解落实成可靠的修改",
    ],
    [
      "Tests are most valuable when they protect the behavior the user depends on. For the ticket button, check that one action adds the intended quantity and that the displayed total follows the selection. Include the case where an earlier request finishes after a later action if asynchronous work is involved. A test that merely counts how often a setter was called says little about the final interface. Also consider the failure path: an unsuccessful request should leave the user able to understand what happened, recover their input, and decide whether to try again.",
      "测试最有价值的作用，是保护用户所依赖的行为。对于加票按钮，要检查一次操作是否加入了预期数量，以及显示的总计是否跟随选择变化。如果涉及异步任务，还应覆盖较早请求在较晚操作之后才完成的情况。仅仅统计设置函数调用次数的测试，很难说明最终界面是否正确。也要考虑 [[failure|failure path]]：请求失败后，用户应当能理解发生了什么，找回自己的输入，并决定是否重试。",
    ],
    [
      "A good review description connects the trigger to the result. Explain that two replacement updates used one captured count, and that ordered updater functions now express two increments. Mention any separate protection against repeated submissions without suggesting that it follows automatically from batching. Keep the scope of the change explicit. If performance or server behavior has not been measured, say so. This gives another developer a clear way to judge the fix, rather than asking them to trust a vague statement that the state handling is now better.",
      "好的评审说明，会把触发条件与最终结果连起来：两次替换更新使用了同一个捕获数量，现在改为按顺序执行的更新函数，以表达两次递增。如果另外实现了防重复提交，也应独立说明，不要暗示它是批处理自动带来的效果。要 [[scope|Keep the scope of the change explicit]]。如果没有测量性能或服务端行为，就明确说出来。这样，另一位开发者才能据此判断修复是否有效，而不必相信一句含糊的“现在状态处理更好了”。",
    ],
    [
      "The original bug was small, but the lesson reaches beyond a counter. Reliable interfaces depend on a clear relationship between the user's action, the values available at that moment, and the state that should appear afterward. Once those pieces are separated, timers and speculative workarounds become less tempting. You can choose an updater, reduce duplicated state, or redesign an operation for a specific reason. The aim is not to memorize a collection of React tricks. It is to make the program's decisions understandable enough that the next change does not reopen the same mystery.",
      "最初的错误很小，但它带来的认识并不局限于计数器。可靠的界面需要清晰地连接用户操作、当时可用的值，以及之后应当出现的状态。把这些部分区分开之后，定时器和靠猜测添加的补丁就不再那么有吸引力。你可以基于明确理由选择更新函数、减少重复状态，或重新设计一次操作。目标并不是记住一组 React 小技巧，而是让程序的决定足够容易理解，使下一次修改不会重新带来同样的困惑。",
    ],
    [
      "Further reading: [React — State as a Snapshot](https://react.dev/learn/state-as-a-snapshot).",
      "延伸阅读：[React — State as a Snapshot](https://react.dev/learn/state-as-a-snapshot)。",
    ],
  ],
  terms: [
    expression(
      "reason",
      "reason about",
      "分析、推理某个过程",
      "Before changing the code, it helps to reason about the sequence of events.",
      "修改代码之前，分析事件发生的顺序会有帮助。",
      "reason about 后接需要理解的过程或问题，常用于技术讨论。",
    ),
    expression(
      "snapshot",
      "snapshot of the state",
      "某一时刻的状态快照",
      "A useful starting point is that each render receives a snapshot of the state.",
      "一个有用的起点是，每次渲染接收的都是状态快照。",
      "snapshot 强调该次渲染看到的固定状态，并不是持续变化的共享变量。",
      "technical",
    ),
    expression(
      "previous",
      "depends on the previous value",
      "取决于前一个值",
      "Use an updater function when the next value depends on the previous value.",
      "下一个值依赖前一个值时，使用更新函数。",
      "depend on 表示依赖；when 明确限定使用更新函数的这个场景。",
    ),
    expression(
      "closure",
      "stale closure",
      "捕获了过时值的闭包",
      "A stale closure can make an otherwise reasonable calculation use an outdated value.",
      "过时的闭包可能使本来合理的计算用到旧值。",
      "stale 表示已经过时，不等同于闭包本身一定有错误；是否需要旧值取决于业务。",
      "technical",
    ),
    expression(
      "truth",
      "single source of truth",
      "权威数据的唯一来源",
      "Prefer a single source of truth when the other values can be derived cheaply and reliably.",
      "其他值能低成本、可靠推导出来时，优先保留唯一的数据来源。",
      "常用于讨论重复状态与数据同步，强调哪一份数据作为依据。",
      "technical",
    ),
    expression(
      "avoid",
      "avoid unnecessary re-renders",
      "避免不必要的重新渲染",
      "It is reasonable to avoid unnecessary re-renders, but first identify where the time is actually spent.",
      "避免不必要的重新渲染是合理的，但要先找出时间真正花在哪里。",
      "avoid 后接名词或动名词；but 引出先测量再优化的限制。",
    ),
    expression(
      "failure",
      "failure path",
      "操作失败时经过的处理流程",
      "Also consider the failure path: an unsuccessful request should leave the user able to understand what happened, recover their input, and decide whether to try again.",
      "也要考虑失败流程：请求失败后，用户应能理解情况、找回输入，并决定是否重试。",
      "与正常成功流程相对，常见于测试与异常处理讨论。",
      "technical",
    ),
    expression(
      "scope",
      "keep the scope of the change explicit",
      "明确说明这次修改的范围",
      "Keep the scope of the change explicit.",
      "明确说明这次修改的范围。",
      "keep + 宾语 + 形容词，表示使某物保持某种状态；explicit 表示清楚明示。",
    ),
  ],
};
