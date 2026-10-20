import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { RootContent, PhrasingContent } from "mdast";
import type { Word } from "../../src/lib/types";
import {
  sendMessage,
  type ArticleDetail,
  type ExtensionPreferences,
  type GlossMode,
  type JobRecord,
  type LibrarySnapshot,
  type UserWord,
  type WordPatch,
} from "./protocol";

const content = document.querySelector<HTMLElement>("#library-content")!;
const status = document.querySelector<HTMLElement>("#status")!;
const dialog = document.querySelector<HTMLDialogElement>("#word-dialog")!;
const wordContent = document.querySelector<HTMLElement>("#word-content")!;
const parser = unified().use(remarkParse).use(remarkGfm);
let snapshot: LibrarySnapshot = {
  articles: [],
  words: [],
  jobs: [],
  localOnly: true,
};
let selectedId = new URL(location.href).searchParams.get("article");
let tab: "articles" | "words" = "articles";
let glossMode: GlossMode = "first";
let original = false;
let selectedWord: {
  word: Word;
  sentence: string;
  meaning: string;
  trigger: HTMLElement;
} | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshing = false;
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function button(text: string, action: () => void, className = "") {
  const item = node("button", text, className);
  item.type = "button";
  item.addEventListener("click", action);
  return item;
}
function show(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString("zh-CN");
}
function safeLink(url: string | null, label: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    const link = node("a", label);
    link.href = parsed.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  } catch {
    return null;
  }
}
function setSelection(id: string | null) {
  selectedId = id;
  original = false;
  const url = new URL(location.href);
  if (id) url.searchParams.set("article", id);
  else url.searchParams.delete("article");
  history.replaceState(null, "", url);
  render();
  window.scrollTo(0, 0);
}
function preservePosition(action: () => void) {
  const anchor = [
    ...content.querySelectorAll<HTMLElement>("[data-paragraph]"),
  ].find((item) => item.getBoundingClientRect().bottom > 70);
  const id = anchor?.dataset.paragraph;
  const top = anchor?.getBoundingClientRect().top;
  action();
  const replacement = [
    ...content.querySelectorAll<HTMLElement>("[data-paragraph]"),
  ].find((item) => item.dataset.paragraph === id);
  if (replacement && top !== undefined)
    window.scrollBy(0, replacement.getBoundingClientRect().top - top);
}
function markdown(
  text: string,
  terms: Map<string, () => Node>,
  sourceUrl: string | null,
) {
  const fragment = document.createDocumentFragment();
  function appendText(parent: Node, value: string) {
    let remaining = value;
    while (remaining) {
      const next = [...terms.keys()]
        .map((marker) => ({ marker, index: remaining.indexOf(marker) }))
        .filter((item) => item.index >= 0)
        .sort((a, b) => a.index - b.index)[0];
      if (!next) {
        parent.appendChild(document.createTextNode(remaining));
        break;
      }
      parent.appendChild(
        document.createTextNode(remaining.slice(0, next.index)),
      );
      parent.appendChild(terms.get(next.marker)!());
      remaining = remaining.slice(next.index + next.marker.length);
    }
  }
  function append(parent: Node, item: RootContent | PhrasingContent) {
    if (item.type === "text") {
      appendText(parent, item.value);
      return;
    }
    if (item.type === "html") {
      parent.appendChild(document.createTextNode(item.value));
      return;
    }
    if (item.type === "image") {
      parent.appendChild(node("span", item.alt || "图片", "muted"));
      return;
    }
    if (item.type === "code") {
      const pre = node("pre");
      pre.append(node("code", item.value));
      parent.appendChild(pre);
      return;
    }
    if (item.type === "inlineCode") {
      parent.appendChild(node("code", item.value));
      return;
    }
    if (item.type === "break" || item.type === "thematicBreak") {
      parent.appendChild(node(item.type === "break" ? "br" : "hr"));
      return;
    }
    let target = parent;
    let wrapper: HTMLElement | null = null;
    if (item.type === "paragraph") wrapper = node("p");
    if (item.type === "heading")
      wrapper = node(`h${Math.min(item.depth + 1, 6)}` as "h2");
    if (item.type === "list") wrapper = node(item.ordered ? "ol" : "ul");
    if (item.type === "listItem") wrapper = node("li");
    if (item.type === "blockquote") wrapper = node("blockquote");
    if (item.type === "strong") wrapper = node("strong");
    if (item.type === "emphasis") wrapper = node("em");
    if (item.type === "delete") wrapper = node("s");
    if (item.type === "table") wrapper = node("table");
    if (item.type === "tableRow") wrapper = node("tr");
    if (item.type === "tableCell") wrapper = node("td");
    if (item.type === "link") {
      try {
        const link = safeLink(
          new URL(item.url, sourceUrl || "https://example.invalid").href,
          "",
        );
        if (link) wrapper = link;
      } catch {
        /* Plain text for invalid destinations. */
      }
    }
    if (wrapper) {
      parent.appendChild(wrapper);
      target = wrapper;
    }
    if ("children" in item)
      for (const child of item.children)
        append(target, child as RootContent | PhrasingContent);
  }
  parser.parse(text).children.forEach((item) => append(fragment, item));
  return fragment;
}
function renderArticle(article: ArticleDetail) {
  const wrapper = node("article", undefined, "local-reader");
  const top = node("div", undefined, "reader-top");
  top.append(button("← 全部文章", () => setSelection(null), "text-button"));
  const source = safeLink(article.sourceUrl, "回到原网页 ↗");
  if (source) top.append(source);
  wrapper.append(top, node("h1", article.title));
  const mode = snapshot.jobs.find(
    (job) => job.id === article.id,
  )?.translationMode;
  if (mode)
    wrapper.append(
      node("p", mode === "free" ? "免费翻译 · 规则选词" : "AI 翻译", "meta"),
    );
  const controls = node("div", undefined, "reader-controls");
  controls.append(
    button(original ? "看学习版" : "看英文原文", () =>
      preservePosition(() => {
        original = !original;
        render();
      }),
    ),
  );
  const label = node("label", "释义 ");
  const select = node("select");
  select.setAttribute("aria-label", "中文释义");
  for (const [value, text] of [
    ["all", "全部显示"],
    ["first", "首次显示"],
    ["click", "点击查看"],
  ]) {
    const option = node("option", text);
    option.value = value;
    select.append(option);
  }
  select.value = glossMode;
  select.addEventListener("change", () => {
    glossMode = select.value as GlossMode;
    preservePosition(render);
    void sendMessage({ type: "ww:preferences:set", glossMode }).catch(
      (error: unknown) =>
        show(error instanceof Error ? error.message : "偏好保存失败。", true),
    );
  });
  label.append(select);
  controls.append(label);
  wrapper.append(controls);
  const occurrences = new Map(
    article.version?.occurrences.map((item) => [item.id, item]),
  );
  const first = new Set<string>();
  const paragraphs =
    article.version?.paragraphs ??
    article.sourceBlocks.map((block, index) => ({
      id: block.id,
      sourceId: block.id,
      position: index,
      original: block.original,
      segments: [{ type: "text" as const, text: block.original }],
    }));
  for (const paragraph of paragraphs) {
    const section = node("section", undefined, "reading-paragraph");
    section.dataset.paragraph = paragraph.sourceId;
    const markers = new Map<string, () => Node>();
    const text = original
      ? paragraph.original
      : paragraph.segments
          .map((segment, index) => {
            const occurrenceId = (
              segment as typeof segment & { occurrenceId?: string }
            ).occurrenceId;
            const occurrence = occurrenceId
              ? occurrences.get(occurrenceId)
              : undefined;
            if (segment.type !== "term" || !occurrence) return segment.text;
            const marker = `WWTERM${crypto.randomUUID().replaceAll("-", "")}END${index}`;
            const isFirst = !first.has(occurrence.vocabularyId);
            first.add(occurrence.vocabularyId);
            markers.set(marker, () => {
              const inline = node("span");
              const term = button(
                segment.text,
                () =>
                  openWord(
                    occurrence.word,
                    occurrence.sentence,
                    occurrence.meaning,
                    term,
                  ),
                `reading-term${occurrence.word.user?.favorite ? " is-favorite" : ""}`,
              );
              term.dataset.wordId = occurrence.word.id;
              inline.append(term);
              if (
                occurrence.word.user?.status !== "KNOWN" &&
                (glossMode === "all" || (glossMode === "first" && isFirst))
              )
                inline.append(
                  node("span", `（${occurrence.meaning}）`, "term-gloss"),
                );
              return inline;
            });
            return marker;
          })
          .join("");
    section.append(markdown(text, markers, article.sourceUrl));
    if (!original && article.version) {
      const details = node("details", undefined, "paragraph-original");
      details.append(
        node("summary", "查看这段原文"),
        markdown(paragraph.original, new Map(), article.sourceUrl),
      );
      section.append(details);
    }
    wrapper.append(section);
  }
  content.append(wrapper);
}
function retryJob(job: JobRecord, trigger: HTMLButtonElement) {
  trigger.disabled = true;
  void sendMessage({ type: "ww:job:retry", id: job.id })
    .then(() => refresh())
    .catch((error: unknown) =>
      show(error instanceof Error ? error.message : "重试失败。", true),
    )
    .finally(() => {
      trigger.disabled = false;
    });
}
function jobCard(job: JobRecord, article?: ArticleDetail) {
  const title = article?.title || job.title || "正在翻译的文章";
  const item = node("section", undefined, "saved-article");
  const provider =
    job.translationMode === "ai"
      ? "AI 翻译"
      : job.translationMode === "free"
        ? "免费翻译 · 规则选词"
        : "本机文章";
  item.append(
    node(
      "p",
      `${provider}${article ? ` · ${date(article.createdAt)}` : ""}`,
      "meta",
    ),
  );
  if (article)
    item.append(button(title, () => setSelection(article.id), "article-title"));
  else item.append(node("h2", title, "article-title"));
  if (job.status === "failed")
    item.append(node("p", job.error || "这次翻译没有完成。", "status error"));
  else if (job.status === "pending" || job.status === "running")
    item.append(
      node(
        "p",
        job.progress
          ? `正在翻译 ${job.progress.completed} / ${job.progress.total} 段…`
          : "正在翻译…",
        "status",
      ),
    );
  else if (article)
    item.append(
      node(
        "p",
        article.version?.paragraphs
          .map((paragraph) =>
            paragraph.segments.map((segment) => segment.text).join(""),
          )
          .join(" ")
          .slice(0, 130) || "原文已保存在这里。",
        "article-preview",
      ),
    );
  const actions = node("div", undefined, "button-row");
  if (article)
    actions.append(
      button("继续阅读 →", () => setSelection(article.id), "text-button"),
    );
  else {
    const source = safeLink(job.sourceUrl ?? null, "回到原网页 ↗");
    if (source) actions.append(source);
  }
  if (job.status === "failed") {
    const retry = button("重试翻译", () => retryJob(job, retry), "text-button");
    actions.append(retry);
  }
  actions.append(
    button(
      "删除",
      () => {
        if (!window.confirm(`删除「${title}」？已收藏的词会保留。`)) return;
        void sendMessage({ type: "ww:library:delete", id: job.id })
          .then(() => {
            if (selectedId === job.id) setSelection(null);
            return refresh();
          })
          .catch((error: unknown) =>
            show(error instanceof Error ? error.message : "删除失败。", true),
          );
      },
      "text-button muted",
    ),
  );
  item.append(actions);
  return item;
}
function renderArticles() {
  const list = node("div", undefined, "article-list");
  const jobs = [...snapshot.jobs];
  for (const article of snapshot.articles)
    if (!jobs.some((job) => job.id === article.id))
      jobs.push({ id: article.id, status: "succeeded" });
  for (const job of jobs)
    list.append(
      jobCard(
        job,
        snapshot.articles.find((article) => article.id === job.id),
      ),
    );
  if (!jobs.length)
    list.append(
      node(
        "p",
        "还没有文章。打开英文网页，点小精灵，再点「翻译本页」。",
        "empty",
      ),
    );
  content.append(list);
}
function renderWords() {
  const words = snapshot.words.filter((word) => word.user?.favorite);
  const list = node("div", undefined, "saved-words");
  for (const word of words) {
    const item = node("section", undefined, "saved-word");
    const title = button(
      word.lemma,
      () =>
        openWord(
          word,
          word.appearances[0]?.sentence || word.example,
          word.meaning,
          title,
        ),
      "word-title",
    );
    title.dataset.wordId = word.id;
    item.append(title, node("p", word.meaning));
    const appearance = word.appearances[0];
    if (appearance)
      item.append(
        node("p", appearance.sentence, "word-sentence"),
        button(
          `来自：${appearance.title}`,
          () => setSelection(appearance.articleId),
          "text-button",
        ),
      );
    list.append(item);
  }
  if (!words.length)
    list.append(
      node("p", "还没有收藏词。阅读时点一下英文表达，再点「收藏」。", "empty"),
    );
  content.append(list);
}
function render() {
  content.replaceChildren();
  document
    .querySelector("#tab-articles")!
    .setAttribute("aria-pressed", String(tab === "articles"));
  document
    .querySelector("#tab-words")!
    .setAttribute("aria-pressed", String(tab === "words"));
  const article = snapshot.articles.find((entry) => entry.id === selectedId);
  if (selectedId && article) renderArticle(article);
  else if (selectedId) {
    const job = snapshot.jobs.find((entry) => entry.id === selectedId);
    if (job)
      content.append(
        button("← 全部文章", () => setSelection(null), "text-button"),
        jobCard(job),
      );
    else
      content.append(
        node(
          "p",
          "这篇文章已不在本机记录中。收藏词仍可以在「收藏词」中查看。",
          "empty",
        ),
        button("返回文章列表", () => setSelection(null)),
      );
  } else if (tab === "words") renderWords();
  else renderArticles();
}
function openWord(
  word: Word,
  sentence: string,
  meaning: string,
  trigger: HTMLElement,
) {
  selectedWord = { word, sentence, meaning, trigger };
  renderWord();
  if (!dialog.open) dialog.showModal();
}
function renderWord() {
  if (!selectedWord) return;
  const { word, sentence, meaning } = selectedWord;
  wordContent.replaceChildren();
  const top = node("div", undefined, "card-top");
  const title = node("h2", word.lemma);
  title.id = "word-title";
  top.append(
    title,
    button("×", () => dialog.close(), "close-word"),
  );
  top.lastElementChild!.setAttribute("aria-label", "关闭词卡");
  wordContent.append(
    top,
    node("p", meaning, "word-meaning"),
    node("p", sentence, "word-sentence"),
  );
  if (word.explanation) wordContent.append(node("p", word.explanation));
  if (word.exampleTranslation)
    wordContent.append(node("p", word.exampleTranslation, "muted"));
  const actions = node("div", undefined, "button-row");
  const update = async (patch: WordPatch) => {
    actions.querySelectorAll("button").forEach((item) => {
      item.disabled = true;
    });
    try {
      const user = await sendMessage<UserWord>({
        type: "ww:word:update",
        id: word.id,
        patch,
      });
      word.user = user;
      snapshot.words
        .filter((item) => item.id === word.id)
        .forEach((item) => {
          item.user = user;
        });
      snapshot.articles.forEach((article) =>
        article.version?.occurrences
          .filter((item) => item.word.id === word.id)
          .forEach((item) => {
            item.word.user = user;
          }),
      );
      preservePosition(render);
      renderWord();
      wordContent
        .querySelector<HTMLButtonElement>(".close-word")
        ?.focus({ preventScroll: true });
    } catch (error) {
      const feedback = node(
        "p",
        error instanceof Error ? error.message : "保存失败。",
        "status error",
      );
      feedback.setAttribute("role", "status");
      wordContent.append(feedback);
      actions.querySelectorAll("button").forEach((item) => {
        item.disabled = false;
      });
    }
  };
  actions.append(
    button(
      word.user?.favorite ? "已收藏 ♥" : "收藏 ♡",
      () => {
        void update({ favorite: !word.user?.favorite });
      },
      word.user?.favorite ? "primary" : "",
    ),
  );
  for (const [value, label] of [
    ["LEARNING", "想学"],
    ["KNOWN", "认识"],
    ["IGNORED", "暂不学习"],
  ] as const)
    actions.append(
      button(
        label,
        () => {
          void update({ status: value });
        },
        word.user?.status === value ? "selected" : "",
      ),
    );
  wordContent.append(actions, node("p", "保存在这个浏览器里。", "help"));
}
dialog.addEventListener("close", () => {
  const trigger = selectedWord?.trigger.isConnected
    ? selectedWord.trigger
    : [...content.querySelectorAll<HTMLElement>("[data-word-id]")].find(
        (item) => item.dataset.wordId === selectedWord?.word.id,
      );
  trigger?.focus({ preventScroll: true });
  selectedWord = null;
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  }
});
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  if (refreshTimer) clearTimeout(refreshTimer);
  try {
    snapshot = await sendMessage<LibrarySnapshot>({ type: "ww:library:get" });
    preservePosition(render);
  } catch (error) {
    show(error instanceof Error ? error.message : "无法读取本机记录。", true);
  } finally {
    refreshing = false;
    if (
      snapshot.jobs.some(
        (job) => job.status === "pending" || job.status === "running",
      )
    )
      refreshTimer = setTimeout(() => {
        void refresh();
      }, 2500);
  }
}
for (const name of ["articles", "words"] as const)
  document.querySelector(`#tab-${name}`)!.addEventListener("click", () => {
    tab = name;
    setSelection(null);
  });
document.querySelector("#settings")!.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
window.addEventListener("focus", () => {
  void refresh();
});
void sendMessage<ExtensionPreferences>({ type: "ww:preferences:get" })
  .then((preferences) => {
    glossMode = preferences.glossMode;
  })
  .catch(() => {})
  .finally(() => {
    void refresh();
  });
