import type { Settings, Term } from "./schemas";

type Edit = readonly [from: string, to: string];
type Levels = {
  low: readonly Edit[];
  // Replace this Chinese sentence with the term's complete original example.
  high: readonly [from: string, termId: string][];
};

// Authored alternatives for the bundled catalog, not a translation algorithm.
// Low uses contextual Chinese; high keeps complete original English sentences.
// Unchanged paragraphs, source IDs, links and protected code stay intact.
const levels: Record<string, Levels> = {
  "react-state-v1": {
    low: [
      ["[[batch|batches state updates]]", "将状态更新批量处理"],
      ["[[snapshot|snapshot]]", "快照"],
      ["就 [[queue|queue]] 一个更新函数", "就把一个更新函数加入队列"],
    ],
    high: [
      [
        "React 会 [[batch|batches state updates]]，以 [[avoid|avoid unnecessary re-renders]]。",
        "batch",
      ],
      ["每次渲染看到的都是状态的一份 [[snapshot|snapshot]]。", "snapshot"],
      [
        "如果下一个状态依赖前一个状态，就 [[queue|queue]] 一个更新函数。",
        "queue",
      ],
      [
        "我们常常需要 [[tradeoff|trade off immediate feedback against fewer renders]]。",
        "tradeoff",
      ],
    ],
  },
  "async-search-v1": {
    low: [
      ["[[race|race condition]]", "竞态条件"],
      ["[[stale|stale data]]", "过时的数据"],
    ],
    high: [
      ["用户快速输入时，多个请求可能同时 [[flight|in flight]]。", "flight"],
      ["旧响应比新响应更晚抵达时，可能出现 [[race|race condition]]。", "race"],
      [
        "如果收到一个响应就立刻展示，新的结果反而可能被 [[stale|stale data]] 覆盖。",
        "stale",
      ],
      [
        "这样，展示的结果与用户最新输入就能保持一致，英文常用 [[consistent|consistent with]] 表达这种关系。",
        "consistent",
      ],
    ],
  },
  "code-review-v1": {
    low: [
      ["[[point|Point out]] 具体的行为", "指出具体的行为"],
      ["放在 [[followup|follow-up change]] 中", "放在后续单独的修改中"],
    ],
    high: [
      ["建议另一种实现之前，先 [[point|Point out]] 具体的行为。", "point"],
      [
        "例如，如果已有调用方依赖旧的默认值，一个可选参数也可能 [[breaking|introduce a breaking change]]。",
        "breaking",
      ],
      [
        "不确定需求时，应当 [[clarification|ask for clarification]]，而不是把假设说成事实。",
        "clarification",
      ],
      [
        "无关的重构也许有价值，但它可能更适合放在 [[followup|follow-up change]] 中。",
        "followup",
      ],
    ],
  },
  "http-cache-v1": {
    low: [
      ["[[origin|origin server]]", "源站服务器"],
      ["向服务器 [[revalidate|revalidate]]", "向服务器重新验证"],
    ],
    high: [
      [
        "缓存通过复用已保存的响应，可以 [[traffic|reduce network traffic]]。",
        "traffic",
      ],
      [
        "设置 Cache-Control: max-age=60 后，通常可以在六十秒内复用响应，不必联系 [[origin|origin server]]。",
        "origin",
      ],
      [
        "响应过期后，客户端可以向服务器 [[revalidate|revalidate]]。",
        "revalidate",
      ],
      [
        "[[former|The former]] 允许保存，但复用前需要验证；后者则要求缓存不要存储响应。",
        "former",
      ],
    ],
  },
  "react-state-long-v1": {
    low: [
      ["[[snapshot|snapshot of the state]]", "状态快照"],
      ["[[previous|depends on the previous value]]", "依赖前一个值"],
      ["[[closure|stale closure]]", "过时的闭包"],
      ["[[truth|single source of truth]]", "单一可信数据来源"],
      [
        "要 [[scope|Keep the scope of the change explicit]]。",
        "要把这次修改的范围说清楚。",
      ],
    ],
    high: [
      [
        "但修改代码之前，先 [[reason|reason about]] 事件发生的顺序会更有帮助：",
        "reason",
      ],
      [
        "一个有用的起点是：每次渲染接收的都是 [[snapshot|snapshot of the state]]。",
        "snapshot",
      ],
      [
        "当下一个值 [[previous|depends on the previous value]] 时，可以使用更新函数。",
        "previous",
      ],
      [
        "[[closure|stale closure]] 会让一个看似合理的计算使用已经过时的数据。",
        "closure",
      ],
      [
        "如果其他值可以低成本、可靠地推导出来，优先保留 [[truth|single source of truth]]：",
        "truth",
      ],
      [
        "希望 [[avoid|avoid unnecessary re-renders]] 很合理，但应先找出时间究竟花在哪里。",
        "avoid",
      ],
      [
        "也要考虑 [[failure|failure path]]：请求失败后，用户应当能理解发生了什么，找回自己的输入，并决定是否重试。",
        "failure",
      ],
      ["要 [[scope|Keep the scope of the change explicit]]。", "scope"],
    ],
  },
  "async-search-long-v1": {
    low: [
      ["[[flight|in flight]]", "处于进行中"],
      ["[[rollback|rollback mechanism]]", "回滚机制"],
      ["[[debounce|Debouncing]]", "防抖"],
      ["[[idempotency|idempotency key]]", "幂等键"],
      ["[[happy|happy path]]", "一切顺利的流程"],
    ],
    high: [
      ["多个请求可以同时 [[flight|in flight]]，", "flight"],
      [
        "对于已经 [[superseded|superseded by a newer request]] 的响应，就忽略它。",
        "superseded",
      ],
      ["因此，取消并不是 [[rollback|rollback mechanism]]。", "rollback"],
      ["[[debounce|Debouncing]] 解决的又是另一个问题：", "debounce"],
      [
        "应当 [[separately|Treat expected cancellation separately from an unexpected failure]]。",
        "separately",
      ],
      [
        "应让用户决定是否最终再试一次，不要把一次点击变成 [[unbounded|unbounded series of requests]]，悄悄消耗时间或付费 API 额度。",
        "unbounded",
      ],
      [
        "带副作用的操作需要专门处理这种不确定性，例如使用 [[idempotency|idempotency key]]，并提供查询已记录结果的方式。",
        "idempotency",
      ],
      [
        "这些情况覆盖了操作的生命周期，而不是假定 [[happy|happy path]] 能代表网络可能出现的全部行为。",
        "happy",
      ],
    ],
  },
  "code-review-long-v1": {
    low: [
      [
        "要 [[blockers|Separate blockers from suggestions]]",
        "要把阻塞项与一般建议区分开",
      ],
      ["[[case|make a case for]] 自己选择的方案", "说明自己选择这一方案的理由"],
      ["来 [[scope|Keep the scope manageable]]", "来控制修改范围"],
      ["[[tradeoffs|Trade-offs]]", "各种取舍"],
      ["一项 [[followup|follow-up change]]", "一项后续修改"],
    ],
    high: [
      [
        "即使函数签名没有变化，修改默认值仍可能 [[breaking|introduce a breaking change]]。",
        "breaking",
      ],
      [
        "需求不明确时，应先 [[clarification|ask for clarification]]，不要把假设直接当成规则。",
        "clarification",
      ],
      [
        "要 [[blockers|Separate blockers from suggestions]]，这样作者才知道回应的优先级。",
        "blockers",
      ],
      [
        "出现分歧时，应结合相关约束，[[case|make a case for]] 自己选择的方案。",
        "case",
      ],
      [
        "要通过判断额外工作是否是实现承诺行为所必需的，来 [[scope|Keep the scope manageable]]。",
        "scope",
      ],
      ["[[tradeoffs|Trade-offs]] 值得被明确解释。", "tradeoffs"],
      [
        "一项 [[followup|follow-up change]] 应当有负责人，或在团队待办列表中有清楚的位置。",
        "followup",
      ],
      [
        "合并之前，要对重要评论 [[loop|close the loop]]：确认哪些问题已经处理，哪些建议有理由地没有采纳，哪些事项留待以后。",
        "loop",
      ],
    ],
  },
  "http-cache-long-v1": {
    low: [
      ["[[freshness|freshness lifetime]]", "新鲜期"],
      ["[[conditional|conditional request]]", "条件请求"],
      ["[[hit|cache hit]]", "缓存命中"],
      ["[[expense|at the expense of correctness]] 换来的", "牺牲正确性换来的"],
    ],
    high: [
      [
        "在 HTTP 层，适用规则允许时，缓存可以 [[reuse|reuse a stored response]]。",
        "reuse",
      ],
      [
        "响应可以具有 [[freshness|freshness lifetime]]：在这段时间内，只要请求和响应规则允许，缓存就可能直接复用它，而不再次联系源站。",
        "freshness",
      ],
      [
        "[[conditional|conditional request]] 可以在检查时携带实体标签等校验标识。",
        "conditional",
      ],
      ["有些表示确实会 [[vary|vary by request headers]]。", "vary"],
      [
        "应用可能需要在成功编辑后 [[invalidate|invalidate cached data]]；共享 HTTP 缓存则可能通过过期、验证，或平台特定的清除机制处理。",
        "invalidate",
      ],
      [
        "[[hit|cache hit]] 表示缓存依照自身规则找到了可用的存储结果，但它不会自动告诉你节省了多少时间，也不能证明显示的信息符合产品的新鲜度要求。",
        "hit",
      ],
      [
        "[[expense|at the expense of correctness]] 换来的更高命中率，不算成功优化。",
        "expense",
      ],
    ],
  },
};

export function sampleLearningAtRetention(
  data: { key: string; learning: string[]; terms: Term[] },
  retention: Settings["retention"],
): string[] {
  const edits = levels[data.key];
  if (retention === "medium" || !edits) return data.learning;
  let learning = [...data.learning];
  for (const [from, target] of edits[retention]) {
    let to = target;
    if (retention === "high") {
      const term = data.terms.find((term) => term.id === target);
      if (!term)
        throw new Error(`Missing sample expression: ${data.key}/${target}`);
      to = term.example;
      for (const marker of from.matchAll(/\[\[([^|]+)\|([^\]]+)\]\]/g)) {
        if (!to.includes(marker[2]))
          throw new Error(
            `Expression is not in its original sentence: ${data.key}/${target}`,
          );
        to = to.replace(marker[2], marker[0]);
      }
      to += " ";
    }
    const matches = learning.filter((text) => text.includes(from));
    if (matches.length !== 1)
      throw new Error(
        `Sample level edit must match one paragraph: ${data.key}/${target}`,
      );
    learning = learning.map((text) => text.replace(from, to));
  }
  return learning;
}
