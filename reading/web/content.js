const make = (id,title,topic,lang,level,pairs,phrase,meaning,question,oral) => ({
  id,title,topic,lang,level, paragraphs:pairs.map(([text,zh],i)=>({id:id+'-'+i,text,zh})),phrase,meaning,question,oral
});
export const samples = [
make('frontend','把改动范围说清楚','前端开发','en','',[
["The change only affects the checkout page. The rest of the app should behave the same way.","这次改动只影响结账页。应用的其他部分应该和之前一样。"],
["I’ll check the empty state and the error state before I hand it over to QA.","交给测试之前，我会先检查空状态和报错状态。"]
],'only affects','只影响','Which page does the change affect, and what should stay the same?','You changed a form. In two sentences, tell a teammate what changed and what you’ll check before handing it over.'),
make('interview','解释一个技术取舍','技术面试','en','',[
["We kept the filters in the URL so users could share the exact view. The trade-off was that we had to handle old links after changing the filter names.","我们把筛选条件放进 URL，这样用户就能分享当前视图。相应的代价是，修改筛选项名称后，我们还得兼容旧链接。"]
],'the trade-off was','相应的代价是','Why did the team keep the filters in the URL?','Describe a frontend decision you made. Explain what it made easier and what it cost.'),
make('project','用两句话介绍项目','项目介绍','en','',[
["I built a map for finding specialty coffee shops. I started with search and filters, then added a map view so people could see what was nearby.","我做了一张用来找精品咖啡馆的地图。我先做了搜索和筛选，再加入地图视图，方便大家看附近有什么店。"]
],'I started with','我先做了','What did the speaker build first?','Introduce one of your own projects. Say who it’s for and what you built first.'),
make('requirements','确认需求边界','需求会','en','',[
["Just to make sure I’ve got this right, are we showing the banner in every country or only where the offer is available? That affects how we set up the configuration.","我确认一下我的理解。这个横幅是在所有国家显示，还是只在有活动的国家显示？这会影响我们怎么配置。"]
],'Just to make sure I’ve got this right','我确认一下我的理解','What does the speaker need to clarify?','Ask a product manager whether a change applies to new users only or to existing users too.'),
make('review','给出可执行的评审意见','代码评审','en','',[
["Could we move this check closer to where the data comes in? Then the component can focus on rendering the result.","我们能把这个检查移到更靠近数据入口的地方吗？这样组件就可以专心渲染结果。"]
],'Could we move this check','我们能把这个检查移到……吗','What benefit would moving the check have?','Suggest one small improvement in a pull request and explain why it helps.'),
make('testing','描述复现条件','测试沟通','en','',[
["I can reproduce it if I switch languages halfway through checkout. It works if I pick the language before I start.","如果结账到一半切换语言，我就能复现这个问题。如果开始前就选好语言，流程正常。"]
],'I can reproduce it if','如果……我就能复现','When does checkout work?','Tell QA how to reproduce a bug and when the same flow works.'),
make('teams','同步跨团队依赖','跨团队沟通','en','',[
["We’re waiting on the API to return a status for expired offers. In the meantime, I’ll finish the UI states we can already test.","我们还在等 API 返回优惠过期状态。在此期间，我会先做完目前可以测试的界面状态。"]
],'In the meantime','在此期间','What can the developer work on while waiting?','Give another team a short update on a dependency and what you can do while you wait.'),
make('city','问清楚公交绕行','城市生活','en','',[
["Is this bus still stopping at Ostbahnhof? I saw the diversion notice, but I couldn’t tell where it rejoins the usual route.","这趟公交还停东站吗？我看到了绕行通知，但没看懂从哪一站回到原线路。"]
],'I couldn’t tell','我没看出来','What is unclear about the diversion?','Ask a driver whether the bus will stop near where you live.'),
make('travel','火车延误后怎么接车','旅行','en','',[
["My train is running late, and I only have ten minutes to change. Can I take the next service if I miss my connection?","我的火车晚点了，只有十分钟换乘。如果没赶上，我能坐下一班吗？"]
],'miss my connection','没赶上接续班次','Why is the passenger worried?','Explain a missed connection to a member of staff in two sentences.'),
make('film','看完电影怎么聊','电影','en','',[
["The first half felt slow to me, but it paid off when the two stories finally came together.","我觉得前半段有点慢，但两条故事线终于交汇时，前面的铺垫就有了回报。"]
],'it paid off','是值得的 / 有了回报','What changed the speaker’s mind?','Describe one thing that worked for you in a film you saw recently.'),
make('coffee','在咖啡馆找座位','咖啡','en','',[
["Could I get a flat white for here? Is there somewhere I can sit with my laptop for an hour?","我想要一杯馥芮白，在这里喝。有适合带笔记本电脑坐一小时的位置吗？"]
],'for here','在店里喝 / 吃','How long does the speaker want to stay?','Order a coffee and ask if there’s a table near a socket.'),
make('culture','问展览最值得看什么','文化','en','',[
["I’ve only got half an hour before the gallery closes. Is there one room you’d recommend starting with?","离美术馆关门只剩半小时。你会推荐先看哪个展厅？"]
],'starting with','先从……开始','Why does the visitor ask for a recommendation?','Ask for a recommendation at an exhibition you have limited time to see.'),
make('de-a1','在咖啡馆点单','咖啡','de','A1',[
["Ich hätte gern einen Kaffee und ein Stück Käsekuchen. Kann ich mit Karte zahlen?","我想要一杯咖啡和一块芝士蛋糕。我可以刷卡吗？"]
],'Ich hätte gern','我想要……','Was bestellt die Person?','Bestelle ein Getränk und frage nach dem Preis.'),
make('de-a2','图书馆临时改时间','城市生活','de','A2',[
["Die Bibliothek schließt heute schon um vier Uhr. Wer Bücher zurückgeben möchte, kann die Box neben dem Eingang benutzen.","图书馆今天四点就关门。想还书的人可以使用入口旁的还书箱。"]
],'neben dem Eingang','在入口旁边','Wo kann man Bücher zurückgeben?','Sag einer Freundin, wann die Bibliothek heute schließt.'),
make('de-b1','周末列车停运','旅行','de','B1',[
["Wegen Bauarbeiten fallen am Wochenende mehrere Züge aus. Zwischen Ostbahnhof und Pasing fahren Busse. Planen Sie bitte etwas mehr Zeit ein.","由于施工，周末有几趟列车停运。东站和帕辛之间有公交车。请多预留一些时间。"]
],'etwas mehr Zeit einplanen','多预留一些时间','Warum fallen mehrere Züge aus?','Erkläre einer Freundin, wie sie am Wochenende nach Pasing kommt.')
];
export const topics = [...new Set(samples.map(x=>x.topic)), '其他'];

const guides = {
  frontend:'只有结账页受影响，应用的其他部分应和以前一样。',
  interview:'把筛选条件放在 URL 中，别人打开链接就能看到完全相同的视图。',
  project:'先做搜索和筛选，再加入地图视图。',
  requirements:'要确认横幅在所有国家显示，还是只在有优惠的国家显示。',
  review:'组件可以专注于渲染结果。',
  testing:'开始结账前选好语言，流程就正常。',
  teams:'等待 API 的同时，先完成目前可以测试的界面状态。',
  city:'乘客不清楚绕行后在哪一站回到原来的路线。',
  travel:'列车晚点，原本只有十分钟换乘，可能赶不上下一班。',
  film:'两条故事线终于交汇，让之前缓慢的铺垫有了回报。',
  coffee:'对方想带电脑坐一个小时。',
  culture:'美术馆还有半小时就要关门。',
  'de-a1':'一杯咖啡和一块芝士蛋糕。',
  'de-a2':'把书放进入口旁的还书箱。',
  'de-b1':'因为施工，有几趟火车停运。'
};
for (const sample of samples) sample.paragraphs[0].answerGuide=guides[sample.id];
samples[0].paragraphs[0].points=['这次改动仅影响结账页面。','应用其他部分的行为应该和以前一样。'];
