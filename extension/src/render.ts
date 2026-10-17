import { unified } from "unified";
import remarkParse from "remark-parse";
import type { RootContent, PhrasingContent } from "mdast";
import type {
  ArticleDetail,
  OccurrenceView,
  UserWord,
} from "../../src/lib/types";
import type { ExtractedBlock } from "./extract";
import type { GlossMode } from "./protocol";

type Paragraph = NonNullable<ArticleDetail["version"]>["paragraphs"][number];
type SavedSegment = Paragraph["segments"][number] & { occurrenceId?: string };
type DomRecord = {
  block: ExtractedBlock;
  original: DocumentFragment;
  translated: DocumentFragment;
  showing: "learning" | "original";
  currentSnapshot: string;
  learningNode: HTMLElement;
  toggle: HTMLButtonElement;
};
const parser = unified().use(remarkParse);
const textStyle = `:host{font:inherit;color:inherit;line-height:inherit}a{color:inherit;text-decoration:underline;text-underline-offset:.16em}code{font-family:ui-monospace,monospace;font-size:.88em;background:rgba(120,120,120,.1);padding:.08em .2em;border-radius:3px}.term{display:inline}button{all:unset;font:inherit;cursor:pointer;color:inherit;border-bottom:1px dashed #b3748a;border-radius:2px}button:hover{background:#f9e5ed}button:focus-visible{outline:2px solid #ad5677;outline-offset:3px}.gloss{color:#7d6b73;font-size:.88em;font-weight:400}.favorite{background:#f9e5ed}button.term-toggle{display:inline-block;font:11px/1.8 system-ui,sans-serif;color:#7b6670;margin-left:8px;border:0;padding:0 4px}`;

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  text?: string,
) {
  const node = document.createElement(name);
  if (text !== undefined) node.textContent = text;
  return node;
}

function preservePosition(blocks: ExtractedBlock[], action: () => void) {
  const anchor = blocks
    .map((block) => block.element)
    .find(
      (node) => node.isConnected && node.getBoundingClientRect().bottom > 60,
    );
  const top = anchor?.getBoundingClientRect().top;
  action();
  if (anchor?.isConnected && top !== undefined)
    window.scrollBy({
      top: anchor.getBoundingClientRect().top - top,
      behavior: "instant",
    });
}

/** No HTML strings from the model are ever interpreted as markup. */
function markdownFragment(
  markdown: string,
  terms: Map<string, () => Node>,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const markers = Array.from(terms.keys());
  function appendText(parent: Node, text: string) {
    let remaining = text;
    while (remaining) {
      const next = markers
        .map((marker) => ({ marker, index: remaining.indexOf(marker) }))
        .filter((entry) => entry.index >= 0)
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
  function append(parent: Node, node: RootContent | PhrasingContent) {
    if (node.type === "text") {
      appendText(parent, node.value);
      return;
    }
    if (node.type === "html") {
      parent.appendChild(document.createTextNode(node.value));
      return;
    }
    if (node.type === "inlineCode" || node.type === "code") {
      parent.appendChild(element("code", node.value));
      return;
    }
    if (node.type === "break") {
      parent.appendChild(element("br"));
      return;
    }
    if (node.type === "image") {
      parent.appendChild(document.createTextNode(node.alt ?? ""));
      return;
    }
    let target = parent;
    if (
      node.type === "strong" ||
      node.type === "emphasis" ||
      node.type === "delete"
    ) {
      const wrapper = element(
        node.type === "strong"
          ? "strong"
          : node.type === "emphasis"
            ? "em"
            : "s",
      );
      parent.appendChild(wrapper);
      target = wrapper;
    } else if (node.type === "link") {
      try {
        const url = new URL(node.url, document.baseURI);
        if (["http:", "https:", "mailto:"].includes(url.protocol)) {
          const link = element("a");
          link.href = url.href;
          link.rel = "noopener noreferrer";
          parent.appendChild(link);
          target = link;
        }
      } catch {
        /* Unsafe destinations become plain text. */
      }
    }
    if ("children" in node)
      node.children.forEach((child) =>
        append(target, child as RootContent | PhrasingContent),
      );
  }
  parser.parse(markdown).children.forEach((node) => append(fragment, node));
  return fragment;
}

export class ReadingReplacement {
  private records: DomRecord[] = [];
  private occurrences = new Map<string, OccurrenceView>();
  private first = new Map<string, string>();
  private clicked = new Set<string>();
  private glosses: {
    node: HTMLElement;
    occurrence: OccurrenceView;
    button: HTMLButtonElement;
  }[] = [];
  private glossMode: GlossMode;
  private route = location.href;
  skipped = 0;
  constructor(
    private blocks: ExtractedBlock[],
    article: ArticleDetail,
    glossMode: GlossMode,
    private openWord: (
      occurrence: OccurrenceView,
      trigger: HTMLElement,
    ) => void,
  ) {
    this.glossMode = glossMode;
    if (!article.version) throw new Error("学习版本尚未生成。");
    article.version.occurrences.forEach((occurrence) => {
      this.occurrences.set(occurrence.id, occurrence);
    });
    const paragraphs = new Map(
      article.version.paragraphs.map((p) => [p.sourceId, p]),
    );
    preservePosition(blocks, () => {
      for (const block of blocks) {
        const paragraph = paragraphs.get(block.id);
        if (
          !paragraph ||
          !block.element.isConnected ||
          block.element.innerHTML !== block.snapshot
        ) {
          this.skipped++;
          continue;
        }
        const host = element("span");
        host.dataset.wordweaveLearning = block.id;
        const shadow = host.attachShadow({ mode: "open" });
        shadow.append(element("style", textStyle));
        const terms = new Map<string, () => Node>();
        const nonce = Array.from(
          crypto.getRandomValues(new Uint32Array(4)),
          (value) => value.toString(16),
        ).join("");
        const markdown = paragraph.segments
          .map((segment: SavedSegment, index) => {
            if (segment.type !== "term") return segment.text;
            const marker = `\uE000${nonce}_${index}\uE001`;
            terms.set(marker, () => this.makeTerm(segment));
            return marker;
          })
          .join("");
        shadow.append(markdownFragment(markdown, terms));
        const toggle = element("button", "查看原文");
        toggle.type = "button";
        toggle.className = "term-toggle";
        toggle.setAttribute("aria-label", "切换本段原文与学习版");
        const original = document.createDocumentFragment();
        while (block.element.firstChild)
          original.append(block.element.firstChild);
        const translated = document.createDocumentFragment();
        block.element.append(host);
        const record: DomRecord = {
          block,
          original,
          translated,
          showing: "learning",
          currentSnapshot: "",
          learningNode: host,
          toggle,
        };
        // Keep the toggle outside the generated content, also when showing original.
        const toggleHost = element("span");
        const toggleShadow = toggleHost.attachShadow({ mode: "open" });
        toggleShadow.append(element("style", textStyle), toggle);
        toggleHost.dataset.wordweaveToggle = block.id;
        block.element.append(toggleHost);
        record.currentSnapshot = block.element.innerHTML;
        toggle.addEventListener("click", () =>
          preservePosition(this.blocks, () =>
            this.swap(
              record,
              record.showing === "learning" ? "original" : "learning",
            ),
          ),
        );
        this.records.push(record);
      }
    });
    this.updateGlosses();
  }
  get count() {
    return this.records.length;
  }
  private makeTerm(segment: SavedSegment) {
    const occurrence = segment.occurrenceId
      ? this.occurrences.get(segment.occurrenceId)
      : undefined;
    if (!occurrence) return document.createTextNode(segment.text);
    // Determine "first" from paragraphs actually placed on the page, not the
    // database's occurrence order or a paragraph skipped after a SPA update.
    if (!this.first.has(occurrence.vocabularyId))
      this.first.set(occurrence.vocabularyId, occurrence.id);
    const wrapper = element("span");
    wrapper.className = "term";
    const button = element("button", segment.text);
    button.type = "button";
    button.dataset.occurrence = occurrence.id;
    button.setAttribute("aria-label", `查看词卡：${segment.text}`);
    button.addEventListener("click", () => {
      this.clicked.add(occurrence.id);
      this.updateGlosses();
      this.openWord(occurrence, button);
    });
    const gloss = element("span", `（${occurrence.meaning}）`);
    gloss.className = "gloss";
    wrapper.append(button, gloss);
    this.glosses.push({ node: gloss, occurrence, button });
    return wrapper;
  }
  private intact(record: DomRecord) {
    return (
      location.href === this.route &&
      record.block.element.isConnected &&
      record.block.element.innerHTML === record.currentSnapshot
    );
  }
  private swap(record: DomRecord, target: "learning" | "original") {
    if (record.showing === target || !this.intact(record)) return;
    const parent = record.block.element;
    const toggleHost = parent.lastChild!;
    const outgoing =
      record.showing === "learning" ? record.translated : record.original;
    while (parent.firstChild && parent.firstChild !== toggleHost)
      outgoing.append(parent.firstChild);
    parent.insertBefore(
      target === "learning" ? record.translated : record.original,
      toggleHost,
    );
    record.showing = target;
    record.toggle.textContent =
      target === "learning" ? "查看原文" : "查看学习版";
    record.currentSnapshot = parent.innerHTML;
  }
  setView(view: "learning" | "original") {
    preservePosition(this.blocks, () =>
      this.records.forEach((record) => this.swap(record, view)),
    );
  }
  setGlossMode(mode: GlossMode) {
    this.glossMode = mode;
    preservePosition(this.blocks, () => this.updateGlosses());
  }
  updateWord(id: string, user: UserWord) {
    this.occurrences.forEach((occurrence) => {
      if (occurrence.vocabularyId === id) occurrence.word.user = user;
    });
    preservePosition(this.blocks, () => this.updateGlosses());
  }
  private updateGlosses() {
    for (const { node, occurrence, button } of this.glosses) {
      node.hidden =
        occurrence.word.user?.status === "KNOWN" ||
        !(
          this.glossMode === "all" ||
          (this.glossMode === "first" &&
            this.first.get(occurrence.vocabularyId) === occurrence.id) ||
          (this.glossMode === "click" && this.clicked.has(occurrence.id))
        );
      button.classList.toggle("favorite", !!occurrence.word.user?.favorite);
    }
  }
  restore() {
    let skipped = 0;
    preservePosition(this.blocks, () => {
      for (const record of this.records) {
        if (!this.intact(record)) {
          skipped++;
          continue;
        }
        if (record.showing === "learning")
          record.block.element.replaceChildren(record.original);
        else record.block.element.lastChild?.remove();
      }
    });
    this.records = [];
    this.glosses = [];
    return skipped;
  }
}
