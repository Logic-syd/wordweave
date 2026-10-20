import { extractPage, type Extraction } from "./extract";
import { ReadingReplacement } from "./render";
import { WordCard } from "./word-card";
import { button, ui, UI_STYLE, spriteIcon } from "./ui";
import {
  sendMessage,
  type ContentMessage,
  type ExtensionPreferences,
  type JobRecord,
  type Retention,
  type GlossMode,
} from "./protocol";

declare global {
  interface Window {
    __wordweaveContentInstalled?: boolean;
  }
}

class ContentController {
  private root: ShadowRoot;
  private panel = ui("section", undefined, "panel");
  private body = ui("div", undefined, "panel-body stack");
  private title = ui("strong", "语境 · 网页学习");
  private minimize: HTMLButtonElement;
  private message = ui("p", "", "message");
  private prefs: ExtensionPreferences = {
    translationMode: "free",
    retention: "medium",
    glossMode: "first",
  };
  private extraction: Extraction | null = null;
  private replacement: ReadingReplacement | null = null;
  private card: WordCard;
  private jobId: string | null = null;
  private articleId: string | null = null;
  private busy = false;
  private polling = false;
  private failed = false;
  private pageUrl = location.href;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private view: "learning" | "original" = "learning";
  private requestEpoch = 0;
  private jobRetention: Retention = "medium";
  constructor() {
    const host = ui("div");
    host.dataset.wordweaveUi = "";
    // The host carries no credential or model data into the page's DOM.
    host.style.cssText =
      "all:initial!important;position:fixed!important;z-index:2147483647!important;pointer-events:none!important;";
    this.root = host.attachShadow({ mode: "open" });
    this.root.append(
      ui("style", UI_STYLE + ".panel,.word-card{pointer-events:auto}"),
    );
    const top = ui("div", undefined, "row between");
    const brand = ui("div", undefined, "row");
    brand.append(spriteIcon(), this.title);
    this.minimize = button(
      "收起",
      () => this.collapse(!this.panel.classList.contains("collapsed")),
      "quiet",
    );
    const close = button(
      "×",
      () => {
        this.panel.hidden = true;
        this.card.close();
      },
      "quiet close",
    );
    close.setAttribute("aria-label", "关闭学习控制面板");
    const controls = ui("div", undefined, "row");
    controls.append(this.minimize, close);
    top.append(brand, controls);
    this.message.setAttribute("role", "status");
    this.panel.append(top, this.body);
    this.root.append(this.panel);
    this.card = new WordCard(this.root, (id, user) =>
      this.replacement?.updateWord(id, user),
    );
    document.documentElement.append(host);
    this.panel.hidden = true;
  }
  async open(scope: "article" | "selection") {
    this.panel.hidden = false;
    this.collapse(false);
    if (this.pageUrl !== location.href) {
      this.requestEpoch++;
      if (this.timer) clearTimeout(this.timer);
      this.replacement?.restore();
      this.replacement = null;
      this.extraction = null;
      this.busy = false;
      this.failed = false;
      this.jobId = null;
      this.articleId = null;
      this.pageUrl = location.href;
    }
    if (this.busy || this.replacement) {
      this.render();
      return;
    }
    try {
      this.extraction = extractPage(scope);
      // Capture selection before asynchronous messaging can shift focus.
      const preferences = await sendMessage<ExtensionPreferences>({
        type: "ww:preferences:get",
      });
      this.prefs = {
        ...preferences,
        translationMode: preferences.translationMode ?? "free",
      };
      this.failed = false;
      this.jobId = null;
      this.articleId = null;
      this.render();
    } catch (error) {
      this.extraction = null;
      this.body.replaceChildren(
        ui("p", "选中一小节英文正文，再打开插件也可以转换。", "muted"),
        this.message,
      );
      this.showError(error);
    }
  }
  restore() {
    this.requestEpoch++;
    const skipped = this.replacement?.restore() ?? 0;
    this.replacement = null;
    this.card.close();
    this.panel.hidden = false;
    this.collapse(false);
    this.body.replaceChildren(
      ui(
        "p",
        skipped
          ? `已恢复未变化的段落。${skipped} 段已被网页更新，语境没有覆盖这些内容。`
          : "已恢复原文。文章和收藏仍保存在本机插件中。",
        "notice",
      ),
    );
    // A pending model request remains saved, but must not rewrite the page after restore.
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.jobId = null;
    this.busy = false;
    this.extraction = null;
  }
  private collapse(collapsed: boolean) {
    this.panel.classList.toggle("collapsed", collapsed);
    this.minimize.textContent = collapsed ? "展开" : "收起";
    this.minimize.setAttribute("aria-expanded", String(!collapsed));
  }
  private showError(error: unknown) {
    this.message.textContent =
      error instanceof Error ? error.message : "操作失败，请重试。";
    this.message.classList.add("error");
  }
  private render() {
    this.body.replaceChildren();
    this.message.textContent = "";
    this.message.classList.remove("error");
    if (this.replacement) {
      this.title.textContent = "语境 · 学习版已就绪";
      const views = ui("div", undefined, "row");
      views.append(
        button(
          "学习版",
          () => {
            this.view = "learning";
            this.replacement?.setView("learning");
            this.render();
          },
          this.view === "learning" ? "selected" : "",
        ),
        button(
          "原文",
          () => {
            this.view = "original";
            this.replacement?.setView("original");
            this.render();
          },
          this.view === "original" ? "selected" : "",
        ),
      );
      const label = ui("label", "中文释义");
      const select = ui("select");
      select.setAttribute("aria-label", "中文释义");
      for (const [value, text] of [
        ["all", "全部显示"],
        ["first", "每词首次显示"],
        ["click", "点击显示"],
      ]) {
        const option = ui("option", text);
        option.value = value;
        select.append(option);
      }
      select.value = this.prefs.glossMode;
      select.addEventListener("change", () => {
        this.prefs.glossMode = select.value as GlossMode;
        this.replacement?.setGlossMode(this.prefs.glossMode);
        void sendMessage({
          type: "ww:preferences:set",
          glossMode: this.prefs.glossMode,
        }).catch((error) => this.showError(error));
      });
      label.append(select);
      const actions = ui("div", undefined, "row");
      actions.append(
        button("打开我的文章", () => {
          if (this.articleId)
            void sendMessage({
              type: "ww:reader:open",
              id: this.articleId,
            }).catch((error) => this.showError(error));
        }),
        button("恢复网页", () => this.restore(), "quiet"),
      );
      this.body.append(
        views,
        label,
        ui(
          "p",
          `${this.prefs.translationMode === "ai" ? "AI 翻译" : "免费翻译"} · ${this.replacement.count} 段。点英文看释义。${this.replacement.skipped ? ` ${this.replacement.skipped} 段已变化，保留原文。` : ""}`,
          "muted",
        ),
        actions,
        this.message,
      );
      return;
    }
    this.title.textContent = this.busy ? "语境 · 正在翻译" : "语境 · 网页学习";
    if (!this.extraction) return;
    const { blocks, characters, scope } = this.extraction;
    this.body.append(
      ui(
        "p",
        `找到 ${blocks.length} 段 · ${characters.toLocaleString()} 个字符`,
        "muted",
      ),
    );
    if (this.extraction.skippedMultilineCode)
      this.body.append(
        ui(
          "p",
          `${this.extraction.skippedMultilineCode} 段包含复杂代码，保留原文。`,
          "muted",
        ),
      );
    if (scope === "selection")
      this.body.append(ui("p", "只翻译选中的完整段落。", "muted"));
    this.body.append(
      ui(
        "p",
        blocks
          .slice(0, 2)
          .map((block) => block.element.textContent)
          .join("\n")
          .slice(0, 280),
        "preview",
      ),
    );
    const label = ui("label", "英文保留量");
    const select = ui("select");
    select.setAttribute("aria-label", "英文保留量");
    for (const [value, text] of [
      ["low", "少"],
      ["medium", "中"],
      ["high", "多"],
    ]) {
      const option = ui("option", text);
      option.value = value;
      select.append(option);
    }
    select.value = this.prefs.retention;
    select.disabled = this.busy;
    select.addEventListener("change", () => {
      this.prefs.retention = select.value as Retention;
      void sendMessage({
        type: "ww:preferences:set",
        retention: this.prefs.retention,
      }).catch((error) => this.showError(error));
    });
    label.append(select);
    this.body.append(
      label,
      ui(
        "p",
        this.prefs.translationMode === "ai"
          ? "正文交给你选的 AI，使用自己的 Key 计费。"
          : "正文交给 Google 免费翻译，代码保持原样。",
        "notice",
      ),
    );
    const start = button(
      this.busy
        ? "翻译中…"
        : this.failed
          ? this.prefs.translationMode === "ai"
            ? "重试 AI 翻译"
            : "重试免费翻译"
          : this.prefs.translationMode === "ai"
            ? "开始 AI 翻译"
            : "开始免费翻译",
      () => void this.start(),
      "primary",
    );
    start.disabled = this.busy;
    this.body.append(start, this.message);
    if (this.busy)
      this.message.textContent = "可以收起面板，结果会保存在本机插件中。";
  }
  private async start() {
    if (this.busy || !this.extraction) return;
    if (
      this.pageUrl !== location.href ||
      this.extraction.blocks.some(
        (block) =>
          !block.element.isConnected ||
          block.element.innerHTML !== block.snapshot,
      )
    ) {
      this.showError(
        new Error("网页正文已经变化，请关闭面板后重新打开插件提取。"),
      );
      return;
    }
    this.busy = true;
    this.render();
    const epoch = ++this.requestEpoch;
    try {
      const retry =
        this.failed && this.jobId && this.jobRetention === this.prefs.retention;
      this.jobRetention = this.prefs.retention;
      const job =
        retry && this.jobId
          ? await sendMessage<JobRecord>({
              type: "ww:job:retry",
              id: this.jobId,
            })
          : await sendMessage<JobRecord>({
              type: "ww:job:start",
              translationMode: this.prefs.translationMode ?? "free",
              input: {
                title: this.extraction.title,
                sourceUrl: this.extraction.sourceUrl,
                blocks: this.extraction.blocks.map(({ id, markdown }) => ({
                  id,
                  markdown,
                })),
              },
              retention: this.prefs.retention,
            });
      if (epoch !== this.requestEpoch) return;
      this.jobId = job.id;
      this.failed = false;
      await this.poll();
    } catch (error) {
      if (epoch !== this.requestEpoch) return;
      this.busy = false;
      this.render();
      this.showError(error);
    }
  }
  private async poll() {
    if (!this.jobId || this.polling) return;
    const id = this.jobId;
    this.polling = true;
    try {
      const job = await sendMessage<JobRecord>({ type: "ww:job:get", id });
      if (id !== this.jobId) return;
      if (job.status === "succeeded" && job.article && this.extraction) {
        this.busy = false;
        this.articleId = job.article.id;
        if (this.pageUrl !== location.href) {
          this.render();
          this.showError(
            new Error("网页已切换。翻译结果已保存在插件的「我的文章」里。"),
          );
          return;
        }
        this.replacement = new ReadingReplacement(
          this.extraction.blocks,
          job.article,
          this.prefs.glossMode,
          (occurrence, trigger) => {
            this.collapse(true);
            this.card.open(occurrence, trigger);
          },
        );
        this.view = "learning";
        this.render();
        // A compact controller leaves room for the actual article.
        this.collapse(true);
      } else if (job.status === "succeeded") {
        throw new Error("未找到翻译结果，请重新查询。");
      } else if (job.status === "failed") {
        this.busy = false;
        this.failed = true;
        this.render();
        this.showError(
          new Error(job.error || "翻译失败，原文已保留。请重试。"),
        );
      } else {
        if (job.progress?.total)
          this.message.textContent = `已处理 ${job.progress.completed} / ${job.progress.total} 段`;
        this.timer = setTimeout(() => void this.poll(), 1000);
      }
    } catch (error) {
      this.busy = false;
      this.render();
      this.showError(error);
      // Polling can be resumed explicitly without starting another paid generation.
      const resume = button("重新查询结果", () => {
        this.busy = true;
        this.render();
        void this.poll();
      });
      this.body.append(resume);
    } finally {
      this.polling = false;
    }
  }
}

if (!window.__wordweaveContentInstalled) {
  window.__wordweaveContentInstalled = true;
  const controller = new ContentController();
  chrome.runtime.onMessage.addListener(
    (message: ContentMessage, sender, respond) => {
      if (
        sender.id !== chrome.runtime.id ||
        !sender.url?.startsWith(chrome.runtime.getURL(""))
      )
        return false;
      if (message.type === "ww:open") {
        void controller.open(message.scope);
        respond({ ok: true, data: null });
      } else if (message.type === "ww:restore") {
        controller.restore();
        respond({ ok: true, data: null });
      }
      return false;
    },
  );
}
