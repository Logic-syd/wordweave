import { db } from "./db";
import { parseSource } from "./markdown";
import {
  settingsSchema,
  type Generation,
  type Segment,
  type Term,
} from "./schemas";
import { saveVersion } from "./repository";
const emptyGrammar = {
  article: "",
  plural: "",
  infinitive: "",
  currentForm: "",
  note: "",
};
const techTerms: Term[] = [
  {
    id: "batch",
    lemma: "batch state updates",
    partOfSpeech: "phrase",
    meaning: "将多个状态更新合并处理",
    grammar: emptyGrammar,
    explanation:
      "batch 可作动词，表示把多个任务组成一批。这里描述 React 对状态更新的批处理。",
    example: "React batches state updates to avoid unnecessary re-renders.",
    exampleTranslation: "React 将状态更新批量处理，以避免不必要的重新渲染。",
    category: "technical",
  },
  {
    id: "avoid",
    lemma: "avoid unnecessary re-renders",
    partOfSpeech: "phrase",
    meaning: "避免不必要的重新渲染",
    grammar: {
      ...emptyGrammar,
      note: "avoid 后接名词或动词 -ing 形式，不接 to do。",
    },
    explanation:
      "avoid unnecessary… 是很实用的技术写作搭配，可迁移为 avoid unnecessary requests / work。",
    example: "React batches state updates to avoid unnecessary re-renders.",
    exampleTranslation: "React 将状态更新批量处理，以避免不必要的重新渲染。",
    category: "general",
  },
  {
    id: "snapshot",
    lemma: "snapshot",
    partOfSpeech: "noun",
    meaning: "某一时刻的状态快照",
    grammar: emptyGrammar,
    explanation:
      "这里用“快照”比喻一次渲染中的固定状态值，不意味着变量会在事件处理函数中即时改变。",
    example: "Each render sees a snapshot of the state.",
    exampleTranslation: "每次渲染看到的都是状态的一份快照。",
    category: "technical",
  },
  {
    id: "queue",
    lemma: "queue",
    partOfSpeech: "verb",
    meaning: "把更新加入队列",
    grammar: emptyGrammar,
    explanation:
      "queue an update 表示将更新排队处理。queue 同时也是名词“队列”。",
    example:
      "If the next state depends on the previous one, queue an updater function.",
    exampleTranslation: "如果下一个状态依赖前一个状态，就把更新函数加入队列。",
    category: "technical",
  },
  {
    id: "tradeoff",
    lemma: "trade off A against B",
    partOfSpeech: "phrase",
    meaning: "在两个目标之间权衡取舍",
    grammar: {
      ...emptyGrammar,
      note: "trade off A against B：把 A 与 B 放在一起权衡，off 是短语动词的一部分。",
    },
    explanation:
      "工作交流中可以说 trade off simplicity against flexibility；不要理解为两个目标可以同时无限优化。",
    example: "We often trade off immediate feedback against fewer renders.",
    exampleTranslation: "我们常常需要在即时反馈与更少的渲染之间权衡。",
    category: "general",
  },
];
const techSource = `# State updates are a queue

React batches state updates to avoid unnecessary re-renders. This does not mean that every update is applied immediately.

Each render sees a snapshot of the state. Calling \`setCount\` requests a new render; it does not change the count in the current event handler.

\`\`\`tsx
// Functional updates use the previous queued value.
setCount(c => c + 1);
setCount(c => c + 1);
// Two increments, not one.
\`\`\`

If the next state depends on the previous one, queue an updater function. React processes these functions in order.

- Use an updater when you depend on the previous value.
- Keep updater functions pure. Do not perform network requests inside them.

We often trade off immediate feedback against fewer renders. Batching can reduce work, but it does not remove the need to measure performance.

Read the [React documentation](https://react.dev/learn/queueing-a-series-of-state-updates) for details.`;
const techLearning = [
  "# 状态更新是一条队列",
  "React 会 [[batch|batch state updates]]，以 [[avoid|avoid unnecessary re-renders]]。这并不意味着每次更新都会立即生效。",
  "每次渲染看到的都是状态的一份 [[snapshot|snapshot]]。调用 `setCount` 是请求一次新渲染；它不会改变当前事件处理函数里的 count 值。",
  "",
  "如果下一个状态依赖前一个状态，就 [[queue|queue]] 一个更新函数。React 会依次处理这些函数。",
  "- 当更新依赖前一个值时，使用更新函数。\n- 保持更新函数的纯粹性，不要在其中发起网络请求。",
  "我们常常需要 [[tradeoff|trade off immediate feedback against fewer renders]]。批处理可以减少工作量，但仍然需要测量性能。",
  "更多细节可以阅读 [React documentation](https://react.dev/learn/queueing-a-series-of-state-updates)。",
];
const germanTerms: Term[] = [
  {
    id: "supermarkt",
    lemma: "Supermarkt",
    partOfSpeech: "noun",
    meaning: "超市",
    grammar: {
      ...emptyGrammar,
      article: "der",
      plural: "die Supermärkte",
      note: "“去超市”表示方向，in 后用第四格：in den Supermarkt。den 是阳性定冠词 der 的第四格。",
    },
    explanation:
      "德语名词首字母大写。记名词时把冠词与复数一起记：der Supermarkt / die Supermärkte。",
    example: "Nach der Arbeit gehe ich in den Supermarkt.",
    exampleTranslation: "下班后我去超市。",
    category: "general",
  },
  {
    id: "tasche",
    lemma: "Einkaufstasche",
    partOfSpeech: "noun",
    meaning: "购物袋",
    grammar: {
      ...emptyGrammar,
      article: "die",
      plural: "die Einkaufstaschen",
      note: "Ich habe meine Einkaufstasche vergessen. 中 meine Einkaufstasche 是第四格宾语。阴性名词的 meine 在这里形式不变。",
    },
    explanation:
      "由 Einkauf（购物）和 Tasche（袋子）组成的复合名词；性由最后一个名词 Tasche 决定。",
    example: "Ich habe meine Einkaufstasche zu Hause vergessen.",
    exampleTranslation: "我把购物袋忘在家里了。",
    category: "general",
  },
  {
    id: "kasse",
    lemma: "Kasse",
    partOfSpeech: "noun",
    meaning: "收银台",
    grammar: {
      ...emptyGrammar,
      article: "die",
      plural: "die Kassen",
      note: "an der Kasse 表示“在收银台”，位置用第三格，die 变成 der。不要把 der Kasse 当作阳性名词。",
    },
    explanation:
      "an der Kasse 是购物中常见的固定搭配。die Kasse 也可以指收款处。",
    example: "An der Kasse wartet eine ältere Frau.",
    exampleTranslation: "一位年长女士在收银台等候。",
    category: "general",
  },
  {
    id: "bezahlen",
    lemma: "bezahlen",
    partOfSpeech: "verb",
    meaning: "付款",
    grammar: {
      ...emptyGrammar,
      infinitive: "bezahlen",
      currentForm: "bezahle",
      note: "ich bezahle / du bezahlst / er bezahlt。be- 是不可分前缀；“用卡付款”说 mit Karte bezahlen。",
    },
    explanation:
      "be- 不是可分前缀，不能把它移到句末。mit Karte 中 mit 支配第三格，这里 Karte 不带冠词。",
    example: "Ich bezahle mit Karte.",
    exampleTranslation: "我用银行卡付款。",
    category: "general",
  },
  {
    id: "bon",
    lemma: "Kassenbon",
    partOfSpeech: "noun",
    meaning: "购物小票",
    grammar: {
      ...emptyGrammar,
      article: "der",
      plural: "die Kassenbons",
      note: "Brauchen Sie den Kassenbon? 中小票是 brauchen 的第四格宾语，所以用 den。",
    },
    explanation:
      "收银员常问 Brauchen Sie den Kassenbon?（您需要小票吗？）。Sie 是礼貌称呼。",
    example: "Die Kassiererin fragt: „Brauchen Sie den Kassenbon?“",
    exampleTranslation: "收银员问：“您需要小票吗？”",
    category: "general",
  },
];
export const germanOriginal = [
  "# Ein kleiner Einkauf nach der Arbeit",
  "Nach der Arbeit gehe ich in den Supermarkt. Es ist Freitag, und ich möchte etwas für das Wochenende kaufen. Draußen regnet es leicht. Meine Brille ist nass. Im Laden ist es warm, und es riecht nach frischem Brot.",
  "Zuerst suche ich Tomaten und Brot. Dann sehe ich einen kleinen Kuchen. Meine Kollegin kommt morgen zum Kaffee. Das haben wir letzte Woche verabredet. Der Kuchen reicht genau für uns beide. Ich sehe ihn mir kurz an und lege ihn in meinen Korb. Am Wochenende möchte ich etwas Süßes essen.",
  "Plötzlich merke ich: Ich habe meine Einkaufstasche zu Hause vergessen. Sie liegt noch neben der Wohnungstür. Nach dem langen Arbeitstag denke ich wohl nur noch an Feierabend. „Das passiert mir immer am Freitag“, sage ich leise. Dann muss ich lachen.",
  "An der Kasse wartet eine ältere Frau. Sie hat nur zwei Äpfel. Ich schiebe meinen Korb ein Stück zurück und lasse sie vor. Sie lächelt und sagt: „Danke, das ist sehr nett!“ Zuerst habe ich mich über die vergessene Tasche geärgert. Jetzt habe ich auch bessere Laune. Mit einer kleinen freundlichen Geste ist das Warten nicht mehr so langweilig.",
  "Die Kassiererin fragt, ob ich eine Tüte brauche. Ich nicke und nehme eine. Dann fragt sie: „Bar oder mit Karte?“ Ich bezahle mit Karte. Ich halte meine Bankkarte an das Gerät. Zum Glück habe ich mein Portemonnaie dabei. Das Gerät piept leise. Die Zahlung ist fertig.",
  "Die Kassiererin fragt: „Brauchen Sie den Kassenbon?“ Ich sage: „Ja, bitte.“ Ich möchte später sehen, wie viel der Kuchen gekostet hat. Ich stecke den Bon in mein Portemonnaie. Dann packe ich alles vorsichtig ein. Der Kuchen kommt ganz oben in die Tüte. Die Tomaten sollen ihn nicht kaputt machen.",
  "Vor dem Laden hat der Regen aufgehört. Die Tüte ist schwer, deshalb gehe ich langsam nach Hause. Ich freue mich auf morgen. Mit meiner Kollegin kann ich Kaffee trinken und über Filme sprechen. Vor meiner Wohnungstür nehme ich mein Handy und schreibe ihr: „Der Kuchen ist schon da!“ So beginnt das Wochenende schon ganz gut.",
  "Zu Hause stelle ich die Einkaufstasche sofort neben meine Schuhe. Nächsten Freitag vergesse ich sie bestimmt nicht. Oder vielleicht doch? Ich mache zur Sicherheit ein Foto davon.",
];
const germanLearning = [
  "# 下班后，一场小小的采购",
  "星期五下班后，我走进了 [[supermarkt|Supermarkt]]。周末快到了，我想买点食材，再给自己找一点期待。外面细雨不停，眼镜也被雨水淋湿了，店里暖暖的，烤面包的香味正好飘过来。",
  "我先去挑西红柿和面包，转身却被一块小蛋糕吸引了。明天同事要来家里喝咖啡，我们上周就约好了。这块蛋糕刚好够两个人吃。我拿起来看了看，决定把它放进购物篮：周末应该有一点甜的东西。",
  "走到一半，我突然想起，[[tasche|Einkaufstasche]] 忘在家里了。出门前明明还看见它躺在门边。工作了一天，脑子好像只记得“下班”两个字。我小声嘀咕：“怎么总是周五忘带？”想完自己也笑了。",
  "[[kasse|Kasse]] 前，一位年长的女士只拿着两个苹果。我把购物篮往后挪了挪，请她先结账。她笑着说了声谢谢。原本因为忘带袋子有点烦躁的我，也跟着心情好了起来。一次很小的礼让，让等待没那么无聊。",
  "收银员问我需不需要袋子。我点头，要了一个。接着她问用现金还是卡。我选择 [[bezahlen|bezahle mit Karte]]，把银行卡贴近机器。幸好这次只忘了购物袋，没有忘钱包。机器轻轻响了一声，付款成功。",
  "最后，收银员举起一张 [[bon|Kassenbon]]，问我需不需要。我说：“需要，谢谢。”我想回家看看蛋糕到底花了多少钱。把小票收进钱包，再仔细地把蛋糕放到最上面，免得一路上被西红柿压扁。",
  "走出店门时，雨已经停了。塑料袋有点沉，我走得慢了一些。想到明天可以和同事一边喝咖啡一边聊电影，心情又亮了起来。到家门口，我发了一条消息：“蛋糕已经准备好了！”一件普通的采购，好像也能给周末开个好头。",
  "回到家，我把 [[tasche|Einkaufstasche]] 放到鞋子旁边，决定下周五一定记得带。想了想，又拿手机拍了一张照片，给自己多留一个提醒。至于到底会不会再忘记，那就等下一次采购来揭晓吧。",
];
function segments(text: string, terms: Term[], original: string): Segment[] {
  const result: Segment[] = [];
  let cursor = 0;
  for (const m of text.matchAll(/\[\[([^|]+)\|([^\]]+)\]\]/g)) {
    if (m.index! > cursor)
      result.push({ type: "text", text: text.slice(cursor, m.index) });
    const t = terms.find((t) => t.id === m[1])!;
    result.push({
      type: "term",
      text: m[2],
      termId: t.id,
      meaning: t.meaning,
      sentence: original.includes(t.example)
        ? t.example
        : (original.split(/(?<=[.!?])\s+/).find((s) => s.includes(m[2])) ??
          t.example),
    });
    cursor = m.index! + m[0].length;
  }
  if (cursor < text.length)
    result.push({ type: "text", text: text.slice(cursor) });
  return result;
}
export async function seedDemos() {
  for (const data of [
    {
      key: "react-state-v1",
      title: "状态更新，并不会立刻发生",
      mode: "tech",
      language: "en",
      source: techSource,
      learning: techLearning,
      terms: techTerms,
      origin: "demo-imported",
    },
    {
      key: "supermarket-v1",
      title: "忘带购物袋的星期五",
      mode: "german",
      language: "de",
      source: germanOriginal.join("\n\n"),
      learning: germanLearning,
      terms: germanTerms,
      origin: "demo-generated",
    },
  ]) {
    const existing = await db.article.findUnique({
      where: { demoKey: data.key },
    });
    if (existing?.activeVersionId) continue;
    const blocks = parseSource(data.source);
    const article =
      existing ??
      (await db.article.create({
        data: {
          demoKey: data.key,
          title: data.title,
          mode: data.mode,
          language: data.language,
          origin: data.origin,
          sourceText: data.source,
          sourceBlocks: JSON.parse(JSON.stringify(blocks)),
          ...(data.mode === "tech"
            ? {
                sourceUrl:
                  "https://react.dev/learn/queueing-a-series-of-state-updates",
              }
            : {}),
        },
      }));
    const token = "demo-seed";
    await db.article.update({
      where: { id: article.id },
      data: { generationToken: token },
    });
    const result: Generation = {
      title: data.title,
      terms: data.terms,
      paragraphs: blocks.map((b, i) => ({
        id: b.id,
        original: b.original,
        segments: segments(
          data.learning[i] || b.original,
          data.terms,
          b.original,
        ),
      })),
    };
    await saveVersion(
      article.id,
      token,
      result,
      settingsSchema.parse({}),
      {
        newWords: data.terms.map((t) => t.lemma),
        reviewWords: [],
        requestedNew: 5,
        requestedReview: 0,
        missing: [],
      },
      [],
      { savePreferences: false },
    );
  }
}
