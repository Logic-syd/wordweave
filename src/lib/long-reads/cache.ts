import { expression, type LongRead } from "./content";

const validation =
  '```http\nGET /catalog HTTP/1.1\nIf-None-Match: "catalog-v7"\n\nHTTP/1.1 304 Not Modified\nETag: "catalog-v7"\nCache-Control: max-age=60\n```';

export const cacheLongRead: LongRead = {
  key: "http-cache-long-v1",
  title: "缓存并不是不更新：一次商品页面的排查",
  blocks: [
    [
      "# A faster page still needs a freshness policy",
      "# 页面变快之外，还需要一套更新规则",
    ],
    [
      "Imagine a small shop that updates the description of a product in the morning. The owner sees the new text immediately, but a customer still sees yesterday's version. Another customer reports that reloading the page fixed it. Someone suggests turning caching off everywhere. That might hide the symptom, but it would also remove a useful part of the system without explaining what happened. A better investigation starts by asking which response was reused, who stored it, and what rule allowed that reuse. The word cache describes several mechanisms, and those mechanisms do not all make decisions in the same place.",
      "设想一家小店在早上更新了商品描述。店主马上看到了新文字，一位顾客却还看到昨天的版本；另一位顾客说刷新后就正常了。有人建议把所有缓存都关掉。这样也许能掩盖症状，却会在没有解释原因的情况下，移除系统中一个有用的部分。更好的调查方式，是先问：哪个响应被复用了？谁保存了它？什么规则允许复用？“缓存”这个词对应着多种机制，它们并不都在同一个地方作决定。",
    ],
    [
      "The browser may keep an HTTP response locally, a shared cache may serve many visitors, and the application may hold data in memory after the request has finished. A service worker can introduce another storage and request-handling layer. These layers have different responsibilities and may have different update rules. Before adjusting a header, identify which layer supplied the information the user saw. If the browser has already received fresh data but a component continues displaying an old in-memory object, changing the server's HTTP caching policy alone may not fix the visible problem.",
      "浏览器可能在本地保留 HTTP 响应，共享缓存可能为许多访客提供内容，应用也可能在请求结束后继续把数据留在内存中。Service Worker 还可以增加一层存储与请求处理机制。各层职责不同，更新规则也可能不同。调整响应头之前，应先找出用户看到的信息由哪一层提供。如果浏览器已经收到新数据，组件却仍显示旧的内存对象，那么仅修改服务器的 HTTP 缓存策略，不一定能解决可见问题。",
    ],
    [
      "At the HTTP layer, caching can reuse a stored response when the applicable rules permit it. This can save network traffic, reduce server work, and shorten the time before useful content appears. The benefit depends on the kind of response and the user's situation. A large image on a slow connection may benefit greatly from reuse, while a tiny response on a fast local network may show a smaller difference. Caching is therefore a policy decision about performance and freshness, not a magic switch that makes every request equally fast or every stored value correct forever.",
      "在 HTTP 层，适用规则允许时，缓存可以 [[reuse|reuse a stored response]]。这能节省网络流量、减少服务器工作，并缩短有用内容出现之前的等待。收益取决于响应类型和用户所处的环境：慢网络上的大图片，可能从复用中获得很大好处；快速本地网络上的微小响应，差异则可能更小。因此，缓存是在性能与新鲜度之间作出的策略决定，不是一个让所有请求都同样快、让所有存储值永远正确的魔法开关。",
    ],
    [
      "## Fresh does not mean the origin was just checked",
      "## 缓存仍有效，不代表刚刚检查过源站",
    ],
    [
      "A response can have a freshness lifetime during which a cache may reuse it without contacting the origin again, subject to the request and response rules. The max-age directive expresses one way to set that lifetime. A cache also has to account for the response's current age, including time it may already have spent in another cache. A value of sixty seconds should not be interpreted as a new full minute starting independently at every intermediate hop. This distinction matters when a response travels through a content delivery network before reaching the browser.",
      "响应可以具有 [[freshness|freshness lifetime]]：在这段时间内，只要请求和响应规则允许，缓存就可能直接复用它，而不再次联系源站。max-age 是设置这一期限的一种方式。缓存还需要考虑响应当前的年龄，包括它可能已经在其他缓存里停留的时间。六十秒不应被理解为每经过一个中间节点，都能独立重新获得完整的一分钟。当响应先经过内容分发网络，再到达浏览器时，这个区别很重要。",
    ],
    [
      "When a response is no longer fresh, it may still be useful. The cache can sometimes ask the server whether the stored representation has changed instead of downloading the entire body again. A conditional request allows that check to carry a validator such as an entity tag. The server evaluates the condition according to the resource and request semantics. If the representation is unchanged for this retrieval, a suitable response can let the cache reuse the body it already has. This is validation of stored data, not a guarantee that no network communication took place.",
      "响应不再新鲜时，仍可能有用。缓存有时可以询问服务器：保存的表示是否发生变化，而不必重新下载整个响应体。[[conditional|conditional request]] 可以在检查时携带实体标签等校验标识。服务器根据资源与请求的语义评估条件；如果这次读取对应的表示没有改变，合适的响应就能让缓存复用已有响应体。这是在验证已保存的数据，并不意味着完全没有网络通信。",
    ],
    [validation, validation],
    [
      "In this simplified exchange, the client already has a catalog body associated with the supplied entity tag. The server's not-modified response tells it to reuse that body while updating relevant stored metadata. A not-modified response is not an empty replacement catalog. The validator also does not encrypt the response, prove that the user is authorized, or solve every consistency problem in the application. Treat it as part of the HTTP representation contract. If the resource depends on authentication or other request information, the server and cache policy must still handle those conditions correctly.",
      "在这组简化交互中，客户端已经保存了与该实体标签对应的商品目录响应体。服务器返回“未修改”，让客户端复用响应体，并更新相关缓存元数据；它不是在用一个空目录替换原目录。校验标识也不会加密响应、证明用户有权限，或解决应用中的所有一致性问题。应把它看作 HTTP 表示契约的一部分。如果资源依赖鉴权或其他请求信息，服务器与缓存策略仍然必须正确处理这些条件。",
    ],
    [
      "Two commonly confused directives are no-cache and no-store. The first does not simply mean that storing is forbidden: a stored response generally needs successful validation before it can be reused under that directive. The second instructs caches not to store the relevant request or response. It should not be treated as a command that reliably erases every older copy already present elsewhere. Choose directives based on the intended behavior rather than on how their names sound. When changing a policy for sensitive or frequently updated content, check both the new responses and the transition from previously stored ones.",
      "两个容易混淆的指令是 no-cache 和 no-store。前者并不简单等于禁止存储：在该指令下，已保存的响应通常需要成功验证之后，才能被复用。后者则要求缓存不要存储相关请求或响应。但不能把它当成一个可以可靠清除其他地方所有旧副本的命令。应根据预期行为选择指令，而不是凭名字猜测。为敏感或经常更新的内容调整策略时，既要检查新响应，也要检查从已有缓存过渡到新策略的过程。",
    ],
    [
      "## Decide who is allowed to share a response",
      "## 决定哪些用户可以共享同一响应",
    ],
    [
      "A shared cache creates additional responsibility because one stored response may be offered to several people. A public image and a personalized account page should not automatically receive the same policy. A private response is intended for a single user's cache rather than shared storage, while no-store may be appropriate when the response should not be stored by caches at all. Exact requirements depend on the data and application. Do not assume that putting a user identifier into a URL or relying on a cookie automatically makes a content delivery network safe for personalized responses.",
      "共享缓存带来了额外责任，因为同一份响应可能被提供给多个用户。公开图片与个性化账户页面，不应自动采用同一策略。private 响应适用于单个用户的缓存，而不是共享存储；如果不应让缓存存储响应，则可能需要 no-store。具体要求仍取决于数据和应用。不要以为在网址里放了用户标识，或者使用了 Cookie，就能自动确保内容分发网络安全地处理个性化响应。",
    ],
    [
      "Some representations legitimately vary by request headers. A server might send different encodings or languages for the same resource, and the cache needs to know which request fields affect that choice. The Vary header can express those dependencies so that reuse considers the relevant fields. However, varying on a header with many distinct values can greatly reduce sharing, and incorrect configuration can still produce the wrong result. It is useful to think of the cache key as a description of when two requests may safely receive the same representation, rather than as a collection of convenient strings.",
      "有些表示确实会 [[vary|vary by request headers]]。同一资源可能因请求不同，返回不同编码或语言，缓存需要知道哪些请求字段影响选择。Vary 响应头可以表达这些依赖，让复用考虑相关字段。不过，如果某个字段具有大量不同值，按它区分缓存可能显著降低共享效率；配置错误也仍可能产生错误结果。可以把缓存键理解为：什么条件下，两次请求可以安全接收同一个表示，而不是随手拼接的一组字符串。",
    ],
    [
      "Static assets and changing documents often need different lifetimes. A script whose filename includes a content hash can usually be given a long lifetime when that filename changes whenever its content changes. The HTML document that points to the script may need a shorter lifetime or validation so that visitors discover a new deployment. This arrangement is useful only if the deployment process actually preserves the relationship between names and content. Replacing a file's contents while keeping a supposedly immutable address breaks the assumption and can leave some users with an inconsistent combination of old and new resources.",
      "静态资源与不断变化的文档，往往需要不同期限。如果脚本文件名包含内容哈希，并且每次内容变化都会换文件名，通常可以为它设置较长缓存期限。指向脚本的 HTML 文档则可能需要更短期限或重新验证，才能让访客发现新部署。只有发布流程真正保证名称与内容之间的关系，这种安排才有效。若在声称不可变的网址下替换文件内容，就会破坏这一假设，并可能让部分用户拿到新旧资源混杂的组合。",
    ],
    [
      "Invalidation is the deliberate decision to stop treating a stored value as reusable. An application may need to invalidate cached data after a successful edit, while a shared HTTP cache may use expiration, validation, or a platform-specific purge mechanism. None of these actions should be assumed to update every browser instantly. If immediate consistency is essential, the user-visible workflow needs to reflect that requirement explicitly. In the shop example, showing the confirmed updated description to the editor is a different problem from ensuring that every anonymous visitor sees the new public description at exactly the same moment.",
      "失效处理，是主动决定不再把某个已存储的值视为可复用。应用可能需要在成功编辑后 [[invalidate|invalidate cached data]]；共享 HTTP 缓存则可能通过过期、验证，或平台特定的清除机制处理。不能假定其中任何一个动作都能瞬间更新每个浏览器。如果必须立即保持一致，用户可见的流程就应明确体现这一要求。在小店的例子中，向编辑者显示已确认更新的描述，与确保所有匿名访客在同一时刻看到新公开描述，是两个不同问题。",
    ],
    ["## Investigate with evidence", "## 用证据定位，而不是凭感觉关闭缓存"],
    [
      "The browser's network tools can reveal whether a response came from a local cache, required validation, or was transferred again. Inspect the request and response headers, the status, and any age information supplied by intermediaries. Be aware of the developer tools' own cache-disabling option, because testing with it enabled may hide the behavior real visitors experience. Also distinguish an HTTP cache from an application's in-memory state or the browser's page restoration mechanisms. A screenshot showing old text is useful evidence of the symptom, but it does not identify the layer that caused it.",
      "浏览器网络工具可以显示：响应来自本地缓存、经过了验证，还是重新传输了。应检查请求头、响应头、状态码，以及中间节点提供的年龄信息。要留意开发者工具自身的“禁用缓存”选项，因为打开它进行测试，可能掩盖真实访客经历的行为。还需要区分 HTTP 缓存、应用内存状态，以及浏览器的页面恢复机制。旧文字的截图能证明症状，但不能单凭它判断是哪一层导致了问题。",
    ],
    [
      "Measure the benefit in terms that matter to users. A cache hit means a cache found a usable stored result under its rules; it does not automatically tell you how much time was saved or whether the displayed information met the product's freshness requirement. Track response size, waiting time, origin work, and incorrect or outdated results where appropriate. A higher hit rate at the expense of correctness is not a successful optimization. Useful measurements compare representative interactions before and after a policy change, including a new visitor, a returning visitor, and a visitor arriving just after an update.",
      "应当用对用户有意义的指标衡量收益。[[hit|cache hit]] 表示缓存依照自身规则找到了可用的存储结果，但它不会自动告诉你节省了多少时间，也不能证明显示的信息符合产品的新鲜度要求。根据情况，应跟踪响应大小、等待时间、源站工作量，以及错误或过时的结果。[[expense|at the expense of correctness]] 换来的更高命中率，不算成功优化。有效的测量，应比较策略变化前后的典型交互，包括新访客、回访者，以及刚好在内容更新后到达的访客。",
    ],
    [
      "Tests can turn the intended policy into an observable contract. Request the same public resource twice, then update it and check the relevant validation behavior. Confirm that different users cannot receive one another's personalized content through a shared cache. Verify that a new HTML document can discover newly named assets and that a failed fetch does not leave the interface pretending an edit succeeded. These checks do not prove that every intermediary on the internet is correctly configured, but they can catch important mistakes in the components and deployment path that the team actually controls.",
      "测试可以把预期策略变成可观察的契约：对同一公开资源请求两次，再更新它并检查相关验证行为；确认不同用户不会经由共享缓存收到彼此的个性化内容；验证新 HTML 文档能发现新命名的资源，以及请求失败时界面不会假装编辑成功。这些检查无法证明互联网上每个中间节点都配置正确，但能抓住团队实际控制的组件和发布路径中的重要错误。",
    ],
    [
      "Returning to the shop, the goal is not simply to make a reload display new text once. It is to understand the policy that produced the old text and choose a better one for the resource. The final fix may involve a response header, a deployment rule, an application state update, or several of these together. Explain which layer changed and what behavior should now occur. A useful caching design makes reuse predictable, updates understandable, and privacy boundaries explicit. Speed then becomes a benefit of a clear contract rather than an accidental result of storing things and hoping they stay right.",
      "回到小店的例子，目标并不只是让某次刷新显示新文字，而是理解什么策略导致了旧文字出现，并为该资源选择更合适的规则。最终修复可能涉及响应头、发布规则、应用状态更新，或它们的组合。应解释改变的是哪一层，以及现在预期发生什么行为。好的缓存设计，让复用可以预测、更新容易理解、隐私边界清晰。这样，速度才会成为明确契约带来的收益，而不是把东西存起来、再盼着它一直正确的偶然结果。",
    ],
    [
      "Further reading: [MDN — HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).",
      "延伸阅读：[MDN — HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)。",
    ],
  ],
  terms: [
    expression(
      "reuse",
      "reuse a stored response",
      "复用已保存的响应",
      "At the HTTP layer, caching can reuse a stored response when the applicable rules permit it.",
      "在 HTTP 层，规则允许时，缓存可以复用已保存的响应。",
      "reuse 强调再次使用；when 限定必须满足相应缓存规则。",
    ),
    expression(
      "freshness",
      "freshness lifetime",
      "缓存无需重新验证即可使用的新鲜期",
      "A response can have a freshness lifetime during which a cache may reuse it without contacting the origin again, subject to the request and response rules.",
      "响应可以有一段新鲜期，在请求和响应规则允许时直接复用，无需再次联系源站。",
      "HTTP 缓存中的术语，需结合响应当前年龄理解。",
      "technical",
    ),
    expression(
      "conditional",
      "conditional request",
      "带条件的请求",
      "A conditional request allows that check to carry a validator such as an entity tag.",
      "条件请求允许检查携带实体标签等校验标识。",
      "在这里用于验证缓存是否仍适用，并不是完全不发请求。",
      "technical",
    ),
    expression(
      "vary",
      "vary by request headers",
      "随请求头的差异而不同",
      "Some representations legitimately vary by request headers.",
      "一些表示会合理地随请求头变化。",
      "vary by 后接造成差异的依据；不表示每种请求头都应进入缓存键。",
    ),
    expression(
      "invalidate",
      "invalidate cached data",
      "使缓存数据失效",
      "An application may need to invalidate cached data after a successful edit, while a shared HTTP cache may use expiration, validation, or a platform-specific purge mechanism.",
      "成功编辑后，应用可能需要让缓存数据失效；共享 HTTP 缓存则可能采用过期、验证或平台清除机制。",
      "使数据不再被视为可复用，不一定等于立即擦除所有副本。",
      "technical",
    ),
    expression(
      "hit",
      "cache hit",
      "按缓存规则找到可复用结果的缓存命中",
      "A cache hit means a cache found a usable stored result under its rules; it does not automatically tell you how much time was saved or whether the displayed information met the product's freshness requirement.",
      "缓存命中表示按规则找到了可用结果，但不自动说明节省的时间或是否满足产品的新鲜度要求。",
      "命中率只是一个指标，不能替代正确性与实际等待时间。",
      "technical",
    ),
    expression(
      "expense",
      "at the expense of correctness",
      "以牺牲正确性为代价",
      "A higher hit rate at the expense of correctness is not a successful optimization.",
      "牺牲正确性换来的更高命中率，不算成功优化。",
      "at the expense of + 名词，表示得到一项好处时损害另一项重要目标。",
    ),
  ],
};
