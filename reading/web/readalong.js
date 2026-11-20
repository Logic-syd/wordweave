import { ui } from "../../src/lib/ui";
import { dailyLesson, speakingPicks } from "../../src/lib/daily";
import {
  saveLesson,
  savedLessons,
  removeSavedLesson,
} from "../../src/lib/saved-lessons";
import { groupUnits } from "./learning.js";
import {
  requestReading,
  lookupEnglish,
  saveReadingWord,
  readArticles,
  savedPracticeArticles,
} from "./local-api";
import {
  importLinks,
  isLinkInput,
  pasteArticleParts,
} from "./readalong-import.js";
const $ = (id) => document.getElementById(id),
  synth = window.speechSynthesis;
const today = dailyLesson();
$("speaking-inbox-toggle").onclick = () => {
  const button = $("speaking-inbox-toggle");
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  $("speaking-inbox-body").classList.toggle("is-open", expanded);
};
document
  .querySelector(".platform-more")
  .addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary").focus();
    }
  });
let sourceUrl = "",
  prepared = null,
  busy = false;
let centerFrame = 0;

let hiddenArticles = new Set();
try {
  hiddenArticles = new Set(
    JSON.parse(localStorage.getItem("readalong.hidden") || "[]"),
  );
} catch {}
let articles = [],
  current = null,
  sentences = [],
  index = 0,
  playing = false,
  timer = null,
  token = 0,
  voices = [],
  utterance = null;
try {
  articles = readArticles(
    JSON.parse(localStorage.getItem("readalong.articles") || "[]"),
  );
} catch {}
function save() {
  try {
    localStorage.setItem("readalong.articles", JSON.stringify(articles));
    return true;
  } catch {
    $("status").textContent = ui("存储空间不足，请导出备份。");
    return false;
  }
}
function split(text) {
  return text
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, "$1")
    .split(/\n+/)
    .flatMap((p) => {
      if (Intl.Segmenter)
        return [
          ...new Intl.Segmenter("en", { granularity: "sentence" }).segment(p),
        ].map((s) => s.segment.trim());
      return p.match(/[^.!?]+[.!?]+["”’']*|[^.!?]+$/g) || [];
    })
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}
function stop() {
  playing = false;
  token++;
  clearTimeout(timer);
  if (synth) synth.cancel();
  $("play").textContent = ui("开始跟读");
}
function render() {
  const root = $("sentences");
  root.replaceChildren();
  const remaining = new Set(
    (current?.vocabulary || [])
      .slice(0, 300)
      .filter(
        (t) =>
          typeof t?.text === "string" &&
          t.text &&
          typeof t.meaning === "string",
      ),
  );
  sentences.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "sentence";
    const n = document.createElement("span");
    n.className = "sentence-number";
    n.textContent = String(i + 1).padStart(2, "0");
    const content = document.createElement("span");
    content.className = "sentence-content";
    let cursor = 0;
    const matches = [];
    for (const term of remaining) {
      let at = s.indexOf(term.text);
      while (at >= 0) {
        const before = s[at - 1] || "",
          after = s[at + term.text.length] || "";
        if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
          matches.push({ at, term });
          break;
        }
        at = s.indexOf(term.text, at + 1);
      }
    }
    matches.sort(
      (a, b) => a.at - b.at || b.term.text.length - a.term.text.length,
    );
    for (const { at, term } of matches) {
      if (at < cursor) continue;
      content.append(document.createTextNode(s.slice(cursor, at)));
      const wrap = document.createElement("span"),
        button = document.createElement("button"),
        meaning = document.createElement("span");
      wrap.className = "term-wrap";
      wrap.onclick = (e) => e.stopPropagation();
      button.className = "gloss-term";
      button.textContent = term.text;
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      meaning.className = "term-meaning";
      meaning.id = "meaning-" + i + "-" + at;
      meaning.textContent = term.meaning;
      meaning.hidden = true;
      button.setAttribute("aria-controls", meaning.id);
      button.onclick = (e) => {
        e.stopPropagation();
        const open = meaning.hidden;
        root
          .querySelectorAll(".term-meaning")
          .forEach((x) => (x.hidden = true));
        root
          .querySelectorAll(".gloss-term")
          .forEach((x) => x.setAttribute("aria-expanded", "false"));
        meaning.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
      };
      wrap.append(button, meaning);
      content.append(wrap);
      cursor = at + term.text.length;
      remaining.delete(term);
    }
    content.append(document.createTextNode(s.slice(cursor)));
    const play = document.createElement("button");
    play.className = "sentence-trigger";
    play.textContent = ui("播放");
    play.setAttribute("aria-label", ui("播放第 ") + (i + 1) + ui(" 句"));
    row.append(n, content, play);
    row.onclick = () => {
      if (window.getSelection()?.toString().trim()) return;
      stop();
      index = i;
      highlight();
      start();
    };
    root.append(row);
  });
  $("count").textContent = sentences.length + ui(" 句");
  updateVocabularyStatus();
  highlight();
}
function updateVocabularyStatus() {
  $("vocabulary-status").textContent = ui(
    "选中单词或短语，免费查中文 · 不用 AI Key",
  );
}
function setFocus(active) {
  document.body.classList.toggle("reading-focus", active);
  $("focus-reading").textContent = active ? ui("文章与设置") : ui("展开正文");
  $("focus-reading").setAttribute("aria-pressed", String(active));
  try {
    localStorage.setItem("readalong.focus", String(active));
  } catch {}
  centerCurrentSentence();
}
$("focus-reading").onclick = () =>
  setFocus(!document.body.classList.contains("reading-focus"));
// Scroll only the article pane; never move the surrounding page or controls.
function centerCurrentSentence() {
  cancelAnimationFrame(centerFrame);
  centerFrame = requestAnimationFrame(() => {
    const root = $("sentences"),
      row = root.children[index];
    if (!row || !sentences.length) return;
    const pane = root.getBoundingClientRect(),
      sentence = row.getBoundingClientRect();
    const toolbar = document
      .querySelector(".practice-toolbar")
      .getBoundingClientRect();
    const top = Math.max(pane.top + root.clientTop, toolbar.bottom, 0);
    const bottom = Math.min(
      pane.top + root.clientTop + root.clientHeight,
      window.innerHeight,
    );
    if (bottom <= top) return;
    // Oversized sentences start at the top; first/last sentences stop at the boundaries.
    const offset =
      sentence.height > bottom - top
        ? sentence.top - top
        : (sentence.top + sentence.bottom - top - bottom) / 2;
    const target = Math.max(
      0,
      Math.min(root.scrollHeight - root.clientHeight, root.scrollTop + offset),
    );
    root.scrollTo({
      top: target,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  });
}
function highlight() {
  [...$("sentences").children].forEach((b, i) =>
    b.classList.toggle("active", i === index),
  );
  $("progress").max = sentences.length || 1;
  $("progress").value = index;
  if (current) {
    current.index = index;
    if (
      current.id !== today.speaking.id ||
      new URLSearchParams(location.search).has("article")
    )
      window.history.replaceState(
        null,
        "",
        `/speak?article=${encodeURIComponent(current.id)}&sentence=${index}#exercise`,
      );
    const stored = articles.find((a) => a.id === current.id);
    if (stored) stored.index = index;
    if (current.id === today.speaking.id) {
      try {
        localStorage.setItem(
          "readalong.daily-progress",
          JSON.stringify({ day: today.day, id: current.id, index }),
        );
      } catch {}
    }
    save();
  }
  centerCurrentSentence();
}
function library() {
  let root = $("library");
  root.replaceChildren();
  if (!articles.length) {
    root.textContent = ui("保存的文章会出现在这里。");
    return;
  }
  articles.forEach((a) => {
    let row = document.createElement("div");
    row.className = "library-row";
    let open = document.createElement("button");
    open.textContent = a.title;
    open.onclick = () => load(a);
    let del = document.createElement("button");
    del.textContent = "×";
    del.setAttribute("aria-label", ui("删除 ") + a.title);
    del.onclick = () => {
      if (!confirm(ui("删除这篇文章？"))) return;
      hiddenArticles.add(a.id);
      try {
        localStorage.setItem(
          "readalong.hidden",
          JSON.stringify([...hiddenArticles]),
        );
      } catch {}
      articles = articles.filter((x) => x.id !== a.id);
      void removeSavedLesson({
        skill: "speak",
        contentId: a.id,
        title: a.title,
      }).catch(() => {});
      if (current?.id === a.id) {
        stop();
        current = null;
        $("status").textContent = ui("文章已从收藏删除。");
      }
      save();
      library();
      updateDaily();
    };
    row.append(open, del);
    root.append(row);
  });
}
function updateDaily() {
  const isToday = current?.id === today.speaking.id;
  $("daily-label").textContent = isToday
    ? "今日口语 / Daily speaking"
    : "口语短文 / Speaking passage";
  $("daily-date").textContent = isToday
    ? `${today.day} · 精选轮换 / Curated rotation`
    : "听一句，跟一句 / Listen and repeat";
  $("daily-pick").dataset.day = today.day;
  $("daily-pick").dataset.contentId = current?.id ?? "";
  $("today-lesson").hidden = isToday;
  $("save-lesson").disabled = !current;
  $("save-lesson").textContent = "保存到我的库 / Save to my library";
  const id = current?.id;
  void savedLessons()
    .then((items) => {
      if (current?.id !== id) return;
      const saved = items.some(
        (item) => item.skill === "speak" && item.contentId === id,
      );
      $("save-lesson").disabled = saved || !current;
      $("save-lesson").textContent = saved
        ? "已保存到我的库 / Saved"
        : "保存到我的库 / Save to my library";
    })
    .catch(() => {});
}
function loadToday() {
  const a = { ...today.speaking, index: 0 };
  try {
    const progress = JSON.parse(
      localStorage.getItem("readalong.daily-progress") || "{}",
    );
    if (
      progress.day === today.day &&
      progress.id === a.id &&
      Number.isInteger(progress.index) &&
      progress.index >= 0
    )
      a.index = progress.index;
  } catch {}
  window.history.replaceState(null, "", "/speak");
  load(a);
}
$("today-lesson").onclick = loadToday;
$("save-lesson").onclick = async () => {
  if (!current || $("save-lesson").disabled) return;
  $("save-lesson").disabled = true;
  $("save-lesson-status").textContent = "";
  const article = current;
  try {
    if (!articles.some((a) => a.id === article.id)) {
      if (articles.length >= 200)
        throw Error(
          "已保存 200 篇，请先整理。 / Your library has 200 articles.",
        );
      articles.unshift({ ...article });
      if (!save()) {
        articles = articles.filter((a) => a.id !== article.id);
        throw Error(
          "无法保存，请检查浏览器存储空间。 / Check your browser's storage space.",
        );
      }
    }
    await saveLesson({
      skill: "speak",
      contentId: article.id,
      title: article.title,
    });
    library();
    updateDaily();
  } catch (e) {
    $("save-lesson-status").textContent = e.message;
    $("save-lesson").disabled = false;
  }
};
function load(a) {
  stop();
  closeLookup();
  try {
    localStorage.setItem("readalong.last", a.id);
  } catch {}
  $("import-status").textContent = "";
  $("ai-status").textContent = "";
  current = a;
  $("title").value = a.title;
  $("text").value = a.text;
  sourceUrl = a.source || "";
  prepared = a.help ? { text: a.text, paragraphs: a.help } : null;
  showHelp(a.help);
  refreshLinks();
  sentences = split(a.text);
  index = Math.min(a.index || 0, Math.max(0, sentences.length - 1));
  $("practiceTitle").textContent = a.title;
  render();
  updateDaily();
  $("status").textContent = ui("已准备好，点击开始跟读。");
}
function start() {
  if (sentences.length) setFocus(true);
  if (!sentences.length) {
    $("status").textContent = ui("请先粘贴文章并生成练习。");
    return;
  }
  if (!synth || !voices.length) {
    $("status").textContent = ui(
      "没有可用英语声音，请在设备设置中安装英语语音，或更换浏览器。",
    );
    return;
  }
  playing = true;
  $("play").textContent = ui("停止 / 休息");
  speak(token);
}
function speak(run) {
  if (!playing || run !== token) return;
  highlight();
  utterance = new SpeechSynthesisUtterance(sentences[index]);
  utterance.voice =
    voices.find((v) => v.voiceURI === $("voice").value) || voices[0];
  utterance.lang = utterance.voice.lang;
  utterance.rate = Number($("rate").value);
  let startTime = performance.now();
  $("status").textContent =
    `正在听 / Listening · ${index + 1} / ${sentences.length}`;
  utterance.onend = () => {
    if (!playing || run !== token) return;
    const mode = $("mode").value;
    const gap =
      mode === "listen"
        ? 350
        : Math.max(
            2000,
            (performance.now() - startTime) * Number($("gap").value),
          );
    $("status").textContent =
      mode === "listen" ? ui("准备下一句…") : ui("轮到你了 · 跟着说一遍");
    timer = setTimeout(() => {
      if (run !== token || !playing) return;
      if (mode !== "loop") index++;
      if (index >= sentences.length) {
        index = 0;
        stop();
        $("progress").value = sentences.length;
        $("status").textContent = ui("这一篇练完了。再读一轮，或换一篇。");
        if (current) {
          current.index = 0;
          save();
        }
        return;
      }
      speak(run);
    }, gap);
  };
  utterance.onerror = () => {
    if (run !== token) return;
    stop();
    $("status").textContent = ui("朗读未完成，请重试或切换声音。");
  };
  synth.speak(utterance);
}
function getVoices() {
  if (!synth) {
    $("status").textContent = ui(
      "此浏览器不支持朗读，请使用支持语音合成的浏览器。",
    );
    return;
  }
  const old = $("voice").value;
  voices = synth.getVoices().filter((v) => /^en([_-]|$)/i.test(v.lang));
  $("voice").replaceChildren();
  voices.forEach((v) => {
    let o = document.createElement("option");
    o.value = v.voiceURI;
    o.textContent = v.name + " · " + v.lang;
    $("voice").append(o);
  });
  if (voices.some((v) => v.voiceURI === old)) $("voice").value = old;
  if (!voices.length) {
    let o = document.createElement("option");
    o.textContent = ui("暂无英语声音");
    $("voice").append(o);
  }
}
function generate() {
  let text = $("text").value.trim();
  if (!text) {
    $("status").textContent = ui("请先粘贴英文正文。");
    $("text").focus();
    return;
  }
  if (text.length > 16000) {
    $("status").textContent = ui(
      "正文最多 16,000 字，请拆成小篇，输入已保留。",
    );
    return;
  }
  if (!current && articles.length >= 200) {
    $("status").textContent = ui("已保存 200 篇，请导出并整理文章。");
    return;
  }
  let title =
    $("title").value.trim() ||
    ui("未命名文章 · ") + new Date().toLocaleDateString();
  let a = {
    id:
      current && !current.id.startsWith("daily-speak-")
        ? current.id
        : crypto.randomUUID(),
    title,
    text,
    index: 0,
    source: sourceUrl,
    help: prepared?.text === text ? prepared.paragraphs : null,
    vocabulary: current?.text === text ? current.vocabulary : null,
  };
  articles = articles.filter((x) => x.id !== a.id);
  articles.unshift(a);
  save();
  library();
  load(a);
  void saveLesson({ skill: "speak", contentId: a.id, title: a.title })
    .then(updateDaily)
    .catch((e) => {
      $("save-lesson-status").textContent = e.message;
    });
}
$("play").onclick = () => {
  if (playing) {
    stop();
    $("status").textContent = ui("已停止，再次开始将重读当前句。");
  } else start();
};
for (const [id, delta] of [
  ["prev", -1],
  ["next", 1],
])
  $(id).onclick = () => {
    stop();
    if (!sentences.length) return;
    index = Math.max(0, Math.min(sentences.length - 1, index + delta));
    highlight();
    $("status").textContent =
      `已选择第 ${index + 1} 句 / Selected sentence ${index + 1}`;
  };
for (const id of ["voice", "rate", "mode", "gap"])
  $(id).onchange = () => {
    if (playing) {
      stop();
      start();
    }
  };
$("new").onclick = () => {
  stop();
  closeLookup();
  setFocus(false);
  current = null;
  sentences = [];
  index = 0;
  $("title").value = "";
  $("text").value = "";
  sourceUrl = "";
  prepared = null;
  showHelp(null);
  refreshLinks();
  $("import-status").textContent = "";
  $("ai-status").textContent = "";
  $("practiceTitle").textContent = ui("新的一篇");
  render();
  updateDaily();
  $("status").textContent = ui("粘贴正文，开始新的练习。");
  $("text").focus();
};
$("demo").onclick = () => {
  loadToday();
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(articles, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "read-along-articles.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("beforeunload", () => {
  if (synth) synth.cancel();
});
getVoices();
if (synth) synth.addEventListener("voiceschanged", getVoices);

function showHelp(paragraphs) {
  const root = $("article-help-body");
  root.replaceChildren();
  $("article-help").hidden = !paragraphs?.length;
  for (const p of paragraphs || []) {
    const section = document.createElement("section");
    section.className = "help-paragraph";
    const translation = document.createElement("p");
    translation.textContent = p.zh;
    section.append(translation);
    root.append(section);
  }
}
function refreshLinks() {
  const raw = $("text").value,
    links = isLinkInput(raw) ? importLinks(raw) : [];
  $("link-choice").hidden = links.length < 2;
  const choice = $("source-choice"),
    previous = choice.value;
  choice.replaceChildren();
  for (const link of links) {
    const option = document.createElement("option");
    option.value = link.url;
    option.textContent = link.title;
    choice.append(option);
  }
  if (links.some((l) => l.url === previous)) choice.value = previous;
  $("fetch-source").hidden = !links.length;
  return links;
}
function setBusy(value) {
  busy = value;
  for (const id of [
    "generate",
    "fetch-source",
    "ai-segment",
    "ai-translate",
    "new",
    "text-file",
    "text",
    "title",
    "source-choice",
  ])
    $(id).disabled = value;
  $("library")
    .querySelectorAll("button")
    .forEach((b) => (b.disabled = value));
}
const requestJson = requestReading;
async function extract() {
  const links = refreshLinks();
  if (!links.length) return false;
  const selected =
    links.find((l) => l.url === $("source-choice").value) || links[0];
  const result = await requestJson("/api/import", { url: selected.url });
  current = null;
  sourceUrl = result.url;
  prepared = null;
  $("text").value = result.text;
  $("title").value = result.title || selected.title;
  refreshLinks();
  $("import-status").textContent = ui("正文已提取，可以直接生成跟读练习。");
  return true;
}
$("fetch-source").onclick = async () => {
  if (busy) return;
  setBusy(true);
  $("import-status").textContent = ui("正在提取正文…");
  try {
    await extract();
  } catch (e) {
    $("import-status").textContent =
      (e.message || ui("提取失败")) + ui(" 可以直接粘贴正文，原内容仍保留。");
  } finally {
    setBusy(false);
  }
};
$("generate").onclick = async () => {
  if (busy) return;
  const fromLink = isLinkInput($("text").value);
  if (fromLink) {
    setBusy(true);
    $("import-status").textContent = ui("正在提取正文…");
    try {
      await extract();
    } catch (e) {
      $("import-status").textContent =
        (e.message || ui("提取失败")) + ui(" 请改为粘贴正文。");
      return;
    } finally {
      setBusy(false);
    }
  }
  generate();
  if (fromLink)
    $("import-status").textContent = ui("正文已提取，跟读练习已生成。");
};
function acceptPaste(raw) {
  if (busy) return;
  if (raw.length > 16000) {
    $("import-status").textContent = ui(
      "正文超过 16000 字，请拆成小篇再粘贴。",
    );
    return;
  }
  const parsed = pasteArticleParts(raw);
  stop();
  current = null;
  sourceUrl = "";
  prepared = null;
  showHelp(null);
  $("ai-status").textContent = "";
  $("text").value = parsed.text;
  $("title").value = parsed.title;
  const links = refreshLinks();
  $("import-status").textContent =
    links.length > 1
      ? ui("检测到多篇推荐，请选一篇再生成跟读练习。")
      : links.length
        ? ui("已识别文章链接，点击「生成跟读练习」即可提取正文。")
        : ui("正文已填入，点击「生成跟读练习」。");
}
$("text").addEventListener("paste", (event) => {
  const field = $("text");
  if (
    field.value &&
    !(field.selectionStart === 0 && field.selectionEnd === field.value.length)
  )
    return;
  let raw = event.clipboardData.getData("text/plain");
  if (!importLinks(raw).length) {
    const html = event.clipboardData.getData("text/html");
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const anchors = [...doc.querySelectorAll("a[href]")].filter((a) =>
        /^https:\/\//.test(a.getAttribute("href")),
      );
      // A copied linked title keeps its URL even if the clipboard's plain text omits it.
      if (anchors.length === 1 && raw.trim() === anchors[0].textContent.trim())
        raw = "[" + raw.trim() + "](" + anchors[0].getAttribute("href") + ")";
    }
  }
  if (raw) {
    event.preventDefault();
    acceptPaste(raw);
  }
});
$("text").addEventListener("input", () => {
  prepared = null;
  refreshLinks();
  $("ai-status").textContent = "";
});
async function readFile(file) {
  if (!file || busy) return;
  if (file.size > 1000000) {
    $("import-status").textContent = ui("文件太大，请拆成小篇再导入。");
    return;
  }
  try {
    const raw = await file.text();
    if (file.name.endsWith(".json")) {
      const values = readArticles(JSON.parse(raw));
      if (!values.length) throw Error(ui("备份里没有文章"));
      const added = values.filter(
        (a) => !articles.some((x) => x.text === a.text),
      );
      if (articles.length + added.length > 200)
        throw Error(ui("最多保存 200 篇，请先整理文章"));
      for (const a of added) {
        const id = articles.some((x) => x.id === a.id)
          ? crypto.randomUUID()
          : a.id;
        articles.unshift({ ...a, id });
      }
      save();
      library();
      load(articles[0]);
      $("import-status").textContent = ui("文章备份已导入。");
    } else {
      if (raw.length > 16000) throw Error(ui("正文超过 16000 字，请拆成小篇"));
      acceptPaste(raw);
      if (!$("title").value)
        $("title").value = file.name.replace(/\.[^.]+$/, "");
    }
  } catch {
    $("import-status").textContent = ui(
      "文件读取失败。请检查 TXT / Markdown，或使用导出的 JSON 备份（最多 200 篇，每篇 16,000 字）。",
    );
  } finally {
    $("text-file").value = "";
  }
}
$("text-file").onchange = () => readFile($("text-file").files[0]);
$("text").addEventListener("dragover", (e) => {
  e.preventDefault();
  $("text").classList.add("drop-active");
});
$("text").addEventListener("dragleave", () =>
  $("text").classList.remove("drop-active"),
);
$("text").addEventListener("drop", (e) => {
  e.preventDefault();
  $("text").classList.remove("drop-active");
  if (e.dataTransfer.files.length) void readFile(e.dataTransfer.files[0]);
  else acceptPaste(e.dataTransfer.getData("text/plain"));
});
async function prepare(action) {
  if (busy) return;
  const raw = $("text").value.trim();
  if (!raw || isLinkInput(raw)) {
    $("ai-status").textContent = ui("请先粘贴正文，或点击「提取正文」。");
    return;
  }
  const editingId = current?.id;
  setBusy(true);
  $("ai-status").textContent =
    action === "segment" ? ui("正在整理段落…") : ui("正在生成中文参考…");
  try {
    if (action === "segment") {
      const units = split(raw);
      if (units.length > 160) throw Error(ui("文章较长，请拆成两篇处理"));
      const result = await requestJson("/api/ai/segment", {
        lang: "en",
        paragraphs: units,
      });
      $("text").value = groupUnits(units, result.groups).join("\n\n");
      prepared = null;
      $("ai-status").textContent = ui(
        "分段已整理，原句保留。点击「生成跟读练习」应用。",
      );
    } else {
      const paragraphs = raw.split(/\n\s*\n/).filter(Boolean),
        help = [];
      for (let i = 0; i < paragraphs.length; i += 6) {
        const result = await requestJson("/api/ai/reading", {
          lang: "en",
          paragraphs: paragraphs.slice(i, i + 6),
        });
        help.push(...result.paragraphs);
      }
      prepared = { text: raw, paragraphs: help };
      if (editingId && current?.id === editingId && current.text === raw) {
        current.help = help;
        save();
        showHelp(help);
        $("article-help").open = true;
      }
      $("ai-status").textContent = ui("中文参考已准备好，可在正文下方展开。");
    }
  } catch (e) {
    $("ai-status").textContent =
      (e.message || ui("处理失败")) + ui(" 原文仍保留，可直接跟读。");
  } finally {
    setBusy(false);
  }
}
$("ai-segment").onclick = () => prepare("segment");
$("ai-translate").onclick = () => prepare("material");
refreshLinks();

// Preserve access to articles already saved in the previous workbench.
async function restoreSavedArticles() {
  try {
    const values = await savedPracticeArticles();
    let added = false;
    for (const item of values) {
      const m = item.value;
      if (
        item.kind !== "materials" ||
        m.audio ||
        m.deleted ||
        hiddenArticles.has(m.id) ||
        !Array.isArray(m.paragraphs) ||
        articles.some((a) => a.id === m.id)
      )
        continue;
      const text = m.paragraphs.map((p) => p.text).join("\n\n");
      if (
        !text ||
        text.length > 16000 ||
        articles.length >= 200 ||
        articles.some((a) => a.text === text)
      )
        continue;
      articles.push({
        id: m.id,
        title: m.title,
        text,
        source: m.source,
        index: 0,
        help: m.paragraphs.some((p) => p.zh) ? m.paragraphs : null,
      });
      added = true;
    }
    if (added) {
      save();
      library();
      if (!current && !$("text").value.trim() && !busy) load(articles[0]);
    }
  } catch {}
}

let lookup = null,
  lookupRun = 0;
function closeLookup() {
  lookupRun++;
  lookup = null;
  $("word-card").hidden = true;
}
async function translateSelection() {
  if (!lookup) return;
  const target = lookup,
    run = ++lookupRun;
  $("lookup-status").textContent = ui("正在免费查义…");
  $("lookup-retry").disabled = true;
  try {
    const meaning = await lookupEnglish(target.form);
    if (run !== lookupRun) return;
    $("lookup-meaning").value = meaning;
    $("lookup-status").textContent = ui(
      "Google 免费翻译 · 只发送选中词，可修改释义",
    );
  } catch (e) {
    if (run === lookupRun) $("lookup-status").textContent = e.message;
  } finally {
    if (run === lookupRun) $("lookup-retry").disabled = false;
  }
}
function selection() {
  const selected = window.getSelection();
  if (!current || !selected || selected.isCollapsed || !selected.rangeCount)
    return;
  const range = selected.getRangeAt(0),
    root = $("sentences");
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return;
  const form = selected.toString().trim();
  if (!form || form.length > 140 || !/[a-z]/i.test(form)) return;
  const row = range.startContainer.parentElement?.closest(".sentence");
  const n = [...root.children].indexOf(row);
  if (n < 0 || !sentences[n].includes(form)) return;
  lookup = {
    articleId: current.id,
    title: current.title,
    index: n,
    sentence: sentences[n],
    form,
  };
  $("lookup-word").textContent = form;
  $("lookup-meaning").value = "";
  $("word-card").hidden = false;
  $("lookup-save").textContent = ui("想学");
  $("lookup-save").disabled = false;
  const known = current.vocabulary?.find((t) => t.text === form);
  if (known) {
    lookupRun++;
    $("lookup-meaning").value = known.meaning;
    $("lookup-status").textContent = ui("已保存的释义");
    $("lookup-retry").disabled = false;
  } else void translateSelection();
}
$("sentences").addEventListener("mouseup", selection);
$("sentences").addEventListener("keyup", selection);
$("sentences").addEventListener("touchend", () => setTimeout(selection, 100));
$("lookup-close").onclick = closeLookup;
$("lookup-retry").onclick = translateSelection;
$("lookup-save").onclick = async () => {
  if (!lookup) return;
  const target = lookup,
    article = current,
    meaning = $("lookup-meaning").value.trim();
  if (!meaning) {
    $("lookup-status").textContent = ui("请先查义或填写中文释义。");
    return;
  }
  $("lookup-save").disabled = true;
  try {
    await saveReadingWord({ ...target, meaning });
    if (article?.id === target.articleId) {
      article.vocabulary = [
        ...(article.vocabulary || []).filter((t) => t.text !== target.form),
        { text: target.form, meaning },
      ].slice(-300);
      save();
    }
    if (lookup === target) {
      $("lookup-save").textContent = ui("已加入单词库");
      $("lookup-status").textContent = ui(
        "听力、口语和阅读共用，已保存在这个浏览器。",
      );
    }
  } catch {
    $("lookup-status").textContent = ui(
      "收藏未成功，释义和原文仍保留，请重试。",
    );
    $("lookup-save").disabled = false;
  }
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLookup();
    $("sentences")
      .querySelectorAll(".term-meaning")
      .forEach((x) => (x.hidden = true));
    $("sentences")
      .querySelectorAll(".gloss-term")
      .forEach((x) => x.setAttribute("aria-expanded", "false"));
    document.querySelector(".playback-options").open = false;
  }
});
const query = new URLSearchParams(location.search);
// Old practice/word links keep their target after the speaking entry moves.
if (query.has("word") || query.has("material")) {
  const target = new URL("/speak/practice", location.origin);
  for (const key of ["word", "material", "paragraph"]) {
    if (query.has(key)) target.searchParams.set(key, query.get(key));
  }
  location.replace(target.href);
} else {
  // Keep existing article IDs and positions, including imported backups from the old site.
  library();
  const selected =
    articles.find((a) => a.id === query.get("article")) ||
    speakingPicks
      .map((a) => ({ ...a, index: 0 }))
      .find((a) => a.id === query.get("article"));
  if (selected) {
    const requested = Number(query.get("sentence"));
    if (
      query.has("sentence") &&
      selected.id === query.get("article") &&
      Number.isInteger(requested) &&
      requested >= 0
    )
      selected.index = requested;
    load(selected);
  } else {
    loadToday();
  }
  try {
    if (localStorage.getItem("readalong.focus") === "true") setFocus(true);
  } catch {}
  updateVocabularyStatus();

  void restoreSavedArticles();
}
