import type { Term } from "./schemas";

const grammar = {
  article: "",
  plural: "",
  infinitive: "",
  currentForm: "",
  note: "",
};
function term(
  id: string,
  lemma: string,
  meaning: string,
  example: string,
  exampleTranslation: string,
  explanation: string,
  extra: Partial<Term> = {},
): Term {
  return {
    id,
    lemma,
    meaning,
    example,
    exampleTranslation,
    explanation,
    partOfSpeech: "phrase",
    category: "general",
    grammar,
    ...extra,
  };
}
function noun(
  id: string,
  lemma: string,
  article: string,
  plural: string,
  meaning: string,
  example: string,
  exampleTranslation: string,
  note: string,
): Term {
  return term(
    id,
    lemma,
    meaning,
    example,
    exampleTranslation,
    `把冠词和名词一起记：${article} ${lemma}。`,
    { partOfSpeech: "noun", grammar: { ...grammar, article, plural, note } },
  );
}

export const extraDemos = [
  {
    key: "async-search-v1",
    title: "搜索框里，谁先返回不一定谁说了算",
    mode: "tech",
    language: "en",
    origin: "demo-authored",
    level: "A2",
    source: `# The last request is not always the last response

When a user types quickly, several requests may be in flight at the same time. The server does not have to finish them in the order they were sent.

A race condition can occur when an older response arrives after a newer one. Showing every response immediately may replace fresh results with stale data.

Ignore responses that no longer match the current query. This keeps the displayed results consistent with the user's latest input.

\`\`\`ts
let latestRequest = 0;
async function search(query: string) {
  const requestId = ++latestRequest;
  const response = await fetch("/search?q=" + encodeURIComponent(query));
  const results = await response.json();
  if (requestId === latestRequest) showResults(results);
}
\`\`\`

An AbortController can also cancel a fetch request. Handle cancellation separately from an unexpected failure, and do not assume that cancellation undoes work already performed on the server.`,
    learning: [
      "# 最后发出的请求，不一定最后返回",
      "用户快速输入时，多个请求可能同时 [[flight|in flight]]。服务器并不一定按照请求发出的顺序完成处理。",
      "旧响应比新响应更晚抵达时，可能出现 [[race|race condition]]。如果收到一个响应就立刻展示，新的结果反而可能被 [[stale|stale data]] 覆盖。",
      "忽略已经不再匹配当前搜索词的响应。这样，展示的结果与用户最新输入就能保持一致，英文常用 [[consistent|consistent with]] 表达这种关系。",
      "",
      "还可以使用 AbortController 取消 fetch 请求。要把取消操作与意外失败分别处理；也不要以为取消就能撤回服务器已经完成的工作。",
    ],
    terms: [
      term(
        "flight",
        "in flight",
        "正在进行，尚未完成",
        "When a user types quickly, several requests may be in flight at the same time.",
        "用户快速输入时，多个请求可能同时处于进行中。",
        "描述请求、任务或数据正在传输或处理中；不是指真的在飞行。",
      ),
      term(
        "race",
        "race condition",
        "执行时序不同可能导致结果变化的竞态条件",
        "A race condition can occur when an older response arrives after a newer one.",
        "旧响应在新响应之后抵达时，可能出现竞态条件。",
        "关键是多个操作的时序影响最终结果。",
        { category: "technical" },
      ),
      term(
        "stale",
        "stale data",
        "已经过时的数据",
        "Showing every response immediately may replace fresh results with stale data.",
        "立刻显示每个响应，可能让旧数据覆盖新结果。",
        "stale 在技术语境里常指缓存或界面中的数据已不再反映当前状态。",
        { category: "technical" },
      ),
      term(
        "consistent",
        "consistent with",
        "与……保持一致",
        "This keeps the displayed results consistent with the user's latest input.",
        "这使展示结果与用户的最新输入保持一致。",
        "keep A consistent with B 是代码评审和需求讨论中的常用搭配。",
      ),
    ],
  },
  {
    key: "code-review-v1",
    title: "一次好沟通，比一句“这里不对”更有用",
    mode: "tech",
    language: "en",
    origin: "demo-authored",
    level: "A2",
    source: `# Make a code review easier to act on

A useful review explains why a change matters. Point out the concrete behavior before suggesting a different implementation.

For example, an optional parameter may introduce a breaking change if existing callers rely on the old default. A small signature change does not always mean a small compatibility risk.

Separate a blocker from a suggestion. If you are not sure about a requirement, ask for clarification instead of presenting an assumption as a fact.

Keep the scope of the review manageable. An unrelated refactor can be valuable, but it may belong in a follow-up change.

The author can summarize the trade-off in a short reply. A clear explanation helps the team decide whether to fix the issue now or record it for later.`,
    learning: [
      "# 让代码评审变得更容易落实",
      "有用的评审会解释修改为什么重要。建议另一种实现之前，先 [[point|Point out]] 具体的行为。",
      "例如，如果已有调用方依赖旧的默认值，一个可选参数也可能 [[breaking|introduce a breaking change]]。函数签名改得少，不代表兼容性风险就小。",
      "把阻塞合并的问题和一般建议区分开。不确定需求时，应当 [[clarification|ask for clarification]]，而不是把假设说成事实。",
      "把评审范围控制在能处理的程度。无关的重构也许有价值，但它可能更适合放在 [[followup|follow-up change]] 中。",
      "作者可以用简短的回复解释取舍。说明清楚后，团队更容易决定现在修复，还是记录下来以后处理。",
    ],
    terms: [
      term(
        "point",
        "point out",
        "指出一个具体问题或事实",
        "Point out the concrete behavior before suggesting a different implementation.",
        "建议另一种实现之前，先指出具体行为。",
        "point out 后面可接问题，也可接 that 引导的事实。这里不等于指责对方。",
      ),
      term(
        "breaking",
        "introduce a breaking change",
        "引入不兼容的变更",
        "For example, an optional parameter may introduce a breaking change if existing callers rely on the old default.",
        "例如，如果现有调用方依赖旧默认值，一个可选参数也可能引入不兼容变更。",
        "breaking change 会破坏已有使用方式，需要调用方适配；保留原句中的 may 和 if。",
      ),
      term(
        "clarification",
        "ask for clarification",
        "请求进一步说明",
        "If you are not sure about a requirement, ask for clarification instead of presenting an assumption as a fact.",
        "如果不确定需求，就请求澄清，不要把假设当事实。",
        "适用于需求、任务边界和接口契约不明确的情况。",
      ),
      term(
        "followup",
        "follow-up change",
        "后续单独进行的修改",
        "An unrelated refactor can be valuable, but it may belong in a follow-up change.",
        "无关重构可能有价值，但也许适合在后续修改中处理。",
        "follow-up 作定语，说明这项改动会接着当前工作进行。",
      ),
    ],
  },
  {
    key: "http-cache-v1",
    title: "浏览器为什么有时不重新下载？",
    mode: "tech",
    language: "en",
    origin: "demo-authored",
    level: "A2",
    source: `# A cache needs a freshness policy

A cache can reduce network traffic by reusing a stored response. It does not guarantee that the stored content is still current.

With Cache-Control: max-age=60, a response can normally be reused for sixty seconds without contacting the origin server. Other cache directives and request conditions may still affect reuse.

After a response becomes stale, the client can revalidate it with the server. An ETag lets the server check whether the representation has changed.

\`\`\`http
If-None-Match: "version-7"
\`\`\`

If the representation is unchanged, the server may return 304 Not Modified. The client can then reuse the cached body instead of downloading it again.

Do not confuse no-cache with no-store. The former permits storage but requires validation before reuse; the latter instructs caches not to store the response.`,
    learning: [
      "# 缓存也需要“保鲜规则”",
      "缓存通过复用已保存的响应，可以 [[traffic|reduce network traffic]]。但这不保证里面的内容仍然是最新的。",
      "设置 Cache-Control: max-age=60 后，通常可以在六十秒内复用响应，不必联系 [[origin|origin server]]。其他缓存指令和请求条件仍可能影响能否复用。",
      "响应过期后，客户端可以向服务器 [[revalidate|revalidate]]。ETag 能帮助服务器检查资源的表示是否发生变化。",
      "",
      "如果资源的表示没有变化，服务器可能返回 304 Not Modified。客户端便可以复用缓存中的响应体，而不用重新下载。",
      "不要混淆 no-cache 和 no-store。[[former|The former]] 允许保存，但复用前需要验证；后者则要求缓存不要存储响应。",
    ],
    terms: [
      term(
        "traffic",
        "reduce network traffic",
        "减少网络传输量",
        "A cache can reduce network traffic by reusing a stored response.",
        "缓存通过复用已保存的响应，可以减少网络传输量。",
        "traffic 在这里指网络流量，而不是道路交通。",
      ),
      term(
        "origin",
        "origin server",
        "提供原始内容的源站服务器",
        "With Cache-Control: max-age=60, a response can normally be reused for sixty seconds without contacting the origin server.",
        "设置 max-age=60 后，响应通常可在六十秒内复用，无需联系源站。",
        "与代理或缓存服务器相对。",
        { category: "technical" },
      ),
      term(
        "revalidate",
        "revalidate",
        "向服务器重新验证缓存是否仍有效",
        "After a response becomes stale, the client can revalidate it with the server.",
        "响应过期后，客户端可以向服务器重新验证。",
        "重新验证不一定需要重新下载完整响应体。",
        { partOfSpeech: "verb", category: "technical" },
      ),
      term(
        "former",
        "the former",
        "前面提到的两者中的前者",
        "The former permits storage but requires validation before reuse; the latter instructs caches not to store the response.",
        "前者允许存储但复用前需验证；后者要求缓存不要存储响应。",
        "常与 the latter（后者）配对，这里前者指 no-cache。",
      ),
    ],
  },
  {
    key: "commute-v1",
    title: "晚点十分钟，早餐却刚刚好",
    mode: "german",
    language: "de",
    origin: "demo-generated",
    level: "A2",
    source: `# Ein anderer Weg ins Büro

Am Montag bin ich früh am Bahnhof. Es ist noch dunkel, und ich bin müde. Normalerweise nehme ich um sieben Uhr den Zug. Heute habe ich genug Zeit für einen Kaffee.

Auf der Anzeige steht: „Der Zug hat zehn Minuten Verspätung.“ Ich schreibe meiner Kollegin eine kurze Nachricht. Sie antwortet: „Kein Problem. Unsere Besprechung beginnt erst um neun.“

Ich kaufe ein Brötchen und einen Kaffee. Dann gehe ich zu Gleis drei. Neben mir steht ein Mann mit einem sehr großen Rucksack. Wir schauen beide auf die Uhr und müssen lachen.

Heute muss ich einmal umsteigen. Im zweiten Zug finde ich einen Sitzplatz am Fenster. Draußen sehe ich einen kleinen Park. Dort möchte ich am Wochenende spazieren gehen.

Ich komme kurz vor acht im Büro an. Meine Kollegin ist auch gerade angekommen. Wir essen zusammen unsere Brötchen. Trotz der Verspätung fängt der Tag ganz ruhig an.`,
    learning: [
      "# 换一条路线去上班",
      "星期一，我早早到了 [[bahnhof|Bahnhof]]。天还黑着，人也没睡醒。平时我坐七点的火车，今天出门早，刚好有时间买杯咖啡。",
      "屏幕上却写着，火车有十分钟 [[delay|Verspätung]]。我给同事发消息，她说没关系，我们的会九点才开始。",
      "我买了面包和咖啡，再走到 [[gleis|Gleis drei]]。旁边的人背着一个特别大的背包，我们同时看了看表，又一起笑了。",
      "今天路上还得 [[change|umsteigen]] 一次。第二班车上，我找到了靠窗的座位。窗外有个小公园，我想周末去那里散步。",
      "快八点时终于到了办公室，用德语可以说 [[arrive|Ich komme kurz vor acht im Büro an.]] 同事也刚到，我们一起吃面包。虽然车晚点了，早晨倒过得很从容。",
    ],
    terms: [
      noun(
        "bahnhof",
        "Bahnhof",
        "der",
        "die Bahnhöfe",
        "火车站",
        "Am Montag bin ich früh am Bahnhof.",
        "星期一，我很早就在火车站了。",
        "am = an dem，表示位置时用第三格。",
      ),
      noun(
        "delay",
        "Verspätung",
        "die",
        "die Verspätungen",
        "晚点，延误",
        "Der Zug hat zehn Minuten Verspätung.",
        "火车晚点十分钟。",
        "Verspätung haben 是常见搭配；十分钟作晚点的时长。",
      ),
      noun(
        "gleis",
        "Gleis",
        "das",
        "die Gleise",
        "轨道；这里指发车股道",
        "Dann gehe ich zu Gleis drei.",
        "然后我走向三号股道。",
        "zu 支配第三格；Gleis 后直接加编号时常不带冠词。",
      ),
      term(
        "change",
        "umsteigen",
        "换乘",
        "Heute muss ich einmal umsteigen.",
        "今天我需要换乘一次。",
        "umsteigen 是可分动词。有情态动词 muss 时，原形放在句末。",
        {
          partOfSpeech: "verb",
          grammar: {
            ...grammar,
            infinitive: "umsteigen",
            currentForm: "umsteigen",
            note: "不用情态动词时：Ich steige um.；完成时：Ich bin umgestiegen.",
          },
        },
      ),
      term(
        "arrive",
        "ankommen",
        "到达",
        "Ich komme kurz vor acht im Büro an.",
        "我在快八点时到达办公室。",
        "ankommen 的前缀 an 在主句中移到句末。",
        {
          partOfSpeech: "verb",
          grammar: {
            ...grammar,
            infinitive: "ankommen",
            currentForm: "komme … an",
            note: "ich komme an；完成时用 sein：Ich bin angekommen.",
          },
        },
      ),
    ],
  },
  {
    key: "cafe-v1",
    title: "咖啡馆靠窗的那张桌子",
    mode: "german",
    language: "de",
    origin: "demo-generated",
    level: "A1",
    source: `# Ein Kaffee am Fenster

Es ist Samstag. Ich gehe in ein kleines Café. Meine Freundin Lena ist schon da. Sie sitzt am Fenster und liest ein Buch.

Ich bestelle einen Kaffee. Lena möchte einen Tee. Der Kellner fragt: „Mit Milch?“ Ich sage: „Ja, bitte.“ Auf dem Tisch stehen frische Blumen.

Wir sprechen über die Woche. Lena hat eine neue Arbeit. Ihr Büro ist nah am Bahnhof. Sie fährt jetzt jeden Morgen mit dem Zug. Ich erzähle von meinem Deutschkurs.

Draußen regnet es. Wir bleiben noch ein bisschen. Lena zeigt mir ein Foto von ihrem Hund. Auf dem Foto schläft er auf dem Sofa.

Dann fragen wir nach der Rechnung. Heute bezahle ich, nächstes Mal bezahlt Lena. Vor der Tür ist es wieder trocken. Wir gehen zusammen zum Park.`,
    learning: [
      "# 靠窗坐一会儿",
      "星期六，我走进一家小咖啡馆。Lena 已经到了，正坐在窗边看书。我们没有别的安排，可以慢慢聊。",
      "我点单时说 [[order|Ich bestelle]]，要一杯 [[coffee|Kaffee]]，Lena 则点了茶。服务员问要不要牛奶，我说要。桌上还放着几枝新鲜的花。",
      "我们聊起这一周。Lena 找到了新工作，办公室就在火车站附近，现在每天坐火车上班。我则说起自己的德语课。",
      "窗外下雨了，我们决定多坐一会儿。Lena 给我看她家小狗的照片，它正睡在沙发上，完全不在乎天气。",
      "最后，我们要了 [[bill|Rechnung]]。今天我付款，下次轮到 Lena。出门时雨又停了，我们一起走向公园。",
    ],
    terms: [
      term(
        "order",
        "bestellen",
        "点餐；订购",
        "Ich bestelle einen Kaffee.",
        "我点一杯咖啡。",
        "在咖啡馆可以直接说 Ich bestelle …；更常见的点单说法还有 Ich hätte gern …。",
        {
          partOfSpeech: "verb",
          grammar: {
            ...grammar,
            infinitive: "bestellen",
            currentForm: "bestelle",
            note: "ich bestelle / du bestellst。be- 不可分，不要把它移到句末。",
          },
        },
      ),
      noun(
        "coffee",
        "Kaffee",
        "der",
        "die Kaffees（不同种类或几杯咖啡）",
        "咖啡；这里指一杯咖啡",
        "Ich bestelle einen Kaffee.",
        "我点一杯咖啡。",
        "Kaffee 是 bestellen 的第四格宾语，所以用 einen；泛指饮料时常不可数。",
      ),
      noun(
        "bill",
        "Rechnung",
        "die",
        "die Rechnungen",
        "账单",
        "Dann fragen wir nach der Rechnung.",
        "然后我们询问账单。",
        "nach 支配第三格，所以 die Rechnung 变为 der Rechnung。",
      ),
    ],
  },
  {
    key: "apartment-v1",
    title: "看房那天，我没有马上说“好”",
    mode: "german",
    language: "de",
    origin: "demo-generated",
    level: "B1",
    source: `# Nicht sofort zusagen

Seit zwei Wochen suche ich eine Wohnung. Eine Anzeige sieht besonders interessant aus: zwei Zimmer, ein Balkon und eine Straßenbahnhaltestelle vor der Tür. Die Fotos zeigen ein helles Wohnzimmer.

Am Mittwoch habe ich einen Termin zur Besichtigung. Die Vermieterin zeigt mir zuerst die Küche. Sie ist kleiner als auf dem Foto, aber das Fenster geht zum ruhigen Innenhof.

Ich frage, ob die Heizkosten in der Miete enthalten sind. Die Vermieterin erklärt, dass die angegebene Warmmiete auch eine Vorauszahlung für die Heizung enthält. Strom muss ich selbst anmelden und bezahlen.

Dann sprechen wir über die Kaution. Ich notiere den Betrag, weil ich später mein Budget prüfen möchte. Außerdem frage ich, wann ich einziehen könnte. Die Wohnung wäre ab dem nächsten Monat frei.

Auf dem Heimweg entscheide ich mich noch nicht. Der Balkon gefällt mir sehr, aber die Straße ist laut. Ich möchte noch eine zweite Wohnung ansehen und beide Angebote in Ruhe vergleichen.`,
    learning: [
      "# 喜欢，也可以再想想",
      "我已经找了两周 [[flat|Wohnung]]。一则广告很吸引人：两个房间、一个阳台，门外还有电车站。照片中的客厅非常明亮。",
      "周三，我按约去 [[visit|Besichtigung]]。房东先带我看厨房，它比照片里小，但窗户朝着安静的内院。",
      "我问，暖气费是否包含在 [[rent|Miete]] 里。房东解释，广告中的暖租包括暖气预付款；电费则需要我自己开户、自己支付。",
      "接着聊到 [[deposit|Kaution]]。我把金额记下来，打算回家检查预算。我也问了入住时间，这套房下个月就空出来了。",
      "回家路上，我没有马上决定：[[decide|entscheide ich mich noch nicht]]。我很喜欢阳台，可街道有些吵，想再看另一套房，然后从容地比较。",
    ],
    terms: [
      noun(
        "flat",
        "Wohnung",
        "die",
        "die Wohnungen",
        "公寓，住宅",
        "Seit zwei Wochen suche ich eine Wohnung.",
        "我已经找了两周房子。",
        "seit 描述持续至今的时间，德语这里用现在时 suche。",
      ),
      noun(
        "visit",
        "Besichtigung",
        "die",
        "die Besichtigungen",
        "实地参观；这里指看房",
        "Am Mittwoch habe ich einen Termin zur Besichtigung.",
        "星期三我有一个看房预约。",
        "zur = zu der；zu 后用第三格。",
      ),
      noun(
        "rent",
        "Miete",
        "die",
        "die Mieten",
        "租金",
        "Ich frage, ob die Heizkosten in der Miete enthalten sind.",
        "我询问暖气费是否包含在租金里。",
        "ob 引导间接疑问从句，变位动词 sind 放在句末。",
      ),
      noun(
        "deposit",
        "Kaution",
        "die",
        "die Kautionen",
        "押金",
        "Dann sprechen wir über die Kaution.",
        "然后我们谈到押金。",
        "sprechen über + 第四格，表示谈论某件事。",
      ),
      term(
        "decide",
        "sich entscheiden",
        "作出决定",
        "Auf dem Heimweg entscheide ich mich noch nicht.",
        "在回家路上，我还没有作出决定。",
        "反身代词随人称变化：ich entscheide mich，du entscheidest dich。",
        {
          partOfSpeech: "verb",
          grammar: {
            ...grammar,
            infinitive: "sich entscheiden",
            currentForm: "entscheide … mich",
            note: "选择某个对象可用 sich für etwas entscheiden，für 后用第四格。",
          },
        },
      ),
    ],
  },
];
