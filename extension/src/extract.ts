export const MAX_BLOCKS = 80;
export const MAX_CHARACTERS = 20000;
const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,blockquote";
const EXCLUDED =
  "nav,header,footer,aside,form,button,input,textarea,select,pre,script,style,noscript,[contenteditable]:not([contenteditable=false]),[hidden],[aria-hidden=true],[data-wordweave-ui]";
const INTERACTIVE =
  "button,input,textarea,select,iframe,video,audio,img,svg,canvas,details";

export type ExtractedBlock = {
  id: string;
  markdown: string;
  element: HTMLElement;
  snapshot: string;
};
export type Extraction = {
  title: string;
  sourceUrl: string;
  blocks: ExtractedBlock[];
  characters: number;
  skippedMultilineCode: number;
  scope: "article" | "selection";
};

function escapeMarkdown(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]<>#!|~.+&-])/g, "\\$1");
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return escapeMarkdown((node.textContent ?? "").replace(/\s+/g, " "));
  if (!(node instanceof HTMLElement)) return "";
  if (node.matches(EXCLUDED)) return "";
  if (node.tagName === "BR") return " ";
  if (node.tagName === "CODE") {
    const value = node.textContent ?? "";
    const runs = value.match(/`+/g) ?? [];
    const delimiter = "`".repeat(
      Math.max(0, ...runs.map((run) => run.length)) + 1,
    );
    const pad =
      value.startsWith("`") ||
      value.endsWith("`") ||
      (/^ .* $/.test(value) && !/^ +$/.test(value))
        ? " "
        : "";
    return `${delimiter}${pad}${value}${pad}${delimiter}`;
  }
  const content = Array.from(node.childNodes, inlineMarkdown).join("");
  if (node.tagName === "A") {
    try {
      const url = new URL(node.getAttribute("href") ?? "", document.baseURI);
      if (["http:", "https:", "mailto:"].includes(url.protocol))
        return `[${content}](<${url.href.replace(/>/g, "%3E").replace(/</g, "%3C")}>)`;
    } catch {
      /* An invalid link remains readable text. */
    }
  }
  if (["STRONG", "B"].includes(node.tagName) && content.trim())
    return `**${content}**`;
  if (["EM", "I"].includes(node.tagName) && content.trim())
    return `*${content}*`;
  return content;
}

function candidates(root: Element) {
  return Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
    (element) => {
      if (element.closest(EXCLUDED) || element.querySelector(INTERACTIVE))
        return false;
      // Only replace leaf blocks. A list item wrapping paragraphs must stay intact.
      if (element.querySelector(BLOCK_SELECTOR)) return false;
      if (
        element.getClientRects().length === 0 ||
        getComputedStyle(element).visibility === "hidden"
      )
        return false;
      const text = element.textContent?.trim() ?? "";
      const english = (text.match(/[a-zA-Z]/g) ?? []).length;
      const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
      return english >= 3 && english > chinese;
    },
  );
}

export function extractPage(
  scope: "article" | "selection",
  selection = window.getSelection(),
): Extraction {
  if (!["http:", "https:"].includes(location.protocol))
    throw new Error("请在普通 HTTP 或 HTTPS 文章网页上使用语境。");
  let elements: HTMLElement[];
  if (scope === "selection") {
    if (!selection || selection.isCollapsed || !selection.rangeCount)
      throw new Error("请先选中一些英文正文，再从插件选择「转换选中段落」。");
    const ranges = Array.from({ length: selection.rangeCount }, (_, i) =>
      selection.getRangeAt(i).cloneRange(),
    );
    elements = candidates(document.body).filter((element) =>
      ranges.some((range) => range.intersectsNode(element)),
    );
  } else {
    const roots = Array.from(
      document.querySelectorAll("article,main,[role=main]"),
    );
    const scored = roots
      .map((root) => ({ elements: candidates(root) }))
      .map((entry) => ({
        ...entry,
        score: entry.elements.reduce(
          (sum, node) => sum + (node.textContent?.length ?? 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score);
    elements = scored[0]?.elements.length
      ? scored[0].elements
      : candidates(document.body);
  }
  if (!elements.length)
    throw new Error(
      "没有找到可安全转换的英文段落。可以先选中正文，再转换选中段落；代码块和交互区域会保留原样。",
    );
  const safeElements = elements.filter(
    (element) =>
      !Array.from(element.querySelectorAll("code")).some((code) =>
        /[\r\n]/.test(code.textContent ?? ""),
      ),
  );
  const skippedMultilineCode = elements.length - safeElements.length;
  if (!safeElements.length)
    throw new Error(
      "这些段落包含多行行内代码，为保持代码原样已跳过。请选取其他英文段落。 ",
    );
  const blocks = safeElements
    .map((element, index) => {
      const content = Array.from(element.childNodes, inlineMarkdown)
        .join("")
        .trim();
      const heading = /^H[1-6]$/.test(element.tagName)
        ? `${"#".repeat(Number(element.tagName[1]))} `
        : "";
      return {
        id: `b${index}`,
        markdown: heading + content,
        element,
        snapshot: element.innerHTML,
      };
    })
    .filter((block) => block.markdown.trim());
  const characters = blocks.reduce(
    (sum, block) => sum + block.markdown.length,
    0,
  );
  if (blocks.length > MAX_BLOCKS || characters > MAX_CHARACTERS)
    throw new Error(
      `找到 ${blocks.length} 段、${characters.toLocaleString()} 个字符，超过单次 ${MAX_BLOCKS} 段 / ${MAX_CHARACTERS.toLocaleString()} 字符上限。请选中较短的一节后再试，正文没有被截断。`,
    );
  return {
    title: (document.title.trim() || "网页学习文章").slice(0, 120),
    sourceUrl: location.href,
    blocks,
    characters,
    skippedMultilineCode,
    scope,
  };
}
