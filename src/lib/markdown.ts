import { unified } from "unified";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent } from "mdast";
import type { Generation, Segment } from "./schemas";

export type SourceBlock = {
  id: string;
  kind: string;
  original: string;
  masked: string;
  protected: Record<string, string>;
};
type Node = {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
  depth?: number;
  ordered?: boolean;
  url?: string;
  value?: string;
};
function tree(markdown: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(markdown);
}
// Model text must not introduce executable markup or new outbound resources.
// Comparing raw protected nodes also prevents a model from adding extra code.
function protectedMarkup(markdown: string) {
  const values: string[] = [];
  function visit(node: Node) {
    if (
      [
        "code",
        "inlineCode",
        "link",
        "image",
        "linkReference",
        "imageReference",
        "html",
        "definition",
      ].includes(node.type)
    ) {
      values.push(
        markdown.slice(
          node.position!.start.offset!,
          node.position!.end.offset!,
        ),
      );
    } else node.children?.forEach(visit);
  }
  visit(tree(markdown) as Node);
  return values.sort();
}
export function assertNoGeneratedMarkup(markdown: string) {
  if (protectedMarkup(markdown).length)
    throw new Error("生成短文不得包含 HTML、代码或外部链接与图片");
}
export function parseSource(source: string): SourceBlock[] {
  const root = tree(source);
  return root.children.map((node: RootContent, index) => {
    const start = node.position!.start.offset!;
    const original = source.slice(start, node.position!.end.offset!);
    const protectedParts: Record<string, string> = {};
    const ranges: { start: number; end: number; token: string }[] = [];
    function visit(n: Node) {
      if (
        [
          "code",
          "inlineCode",
          "link",
          "image",
          "linkReference",
          "imageReference",
          "html",
          "definition",
        ].includes(n.type)
      ) {
        const s = n.position!.start.offset!,
          e = n.position!.end.offset!;
        const token = `⟦PROTECTED_${index}_${ranges.length}⟧`;
        protectedParts[token] = source.slice(s, e);
        ranges.push({ start: s - start, end: e - start, token });
      } else n.children?.forEach(visit);
    }
    visit(node as Node);
    let masked = original;
    for (const range of [...ranges].reverse())
      masked =
        masked.slice(0, range.start) + range.token + masked.slice(range.end);
    return {
      id: `p${String(index + 1).padStart(4, "0")}`,
      kind: node.type,
      original,
      masked,
      protected: protectedParts,
    };
  });
}
export function plainSegments(segments: Segment[]) {
  return segments.map((s) => s.text).join("");
}
function structure(markdown: string) {
  function shape(node: Node): unknown {
    // Text/emphasis may vary during translation, block layout must not.
    if (["root", "list", "listItem", "blockquote"].includes(node.type))
      return [node.type, node.ordered ?? null, node.children?.map(shape)];
    if (node.type === "heading") return ["heading", node.depth];
    return node.type;
  }
  return JSON.stringify(shape(tree(markdown) as Node));
}
export function restoreAndValidate(
  result: Generation,
  blocks: SourceBlock[],
): Generation {
  if (result.paragraphs.length !== blocks.length)
    throw new Error("段落数量与原文不一致");
  const ids = new Set(result.terms.map((t) => t.id));
  if (ids.size !== result.terms.length) throw new Error("词条 ID 重复");
  const paragraphs = result.paragraphs.map((p, i) => {
    const block = blocks[i];
    if (p.id !== block.id) throw new Error("段落顺序或对应 ID 不一致");
    if (
      block.kind === "code" ||
      block.kind === "html" ||
      block.kind === "definition" ||
      block.kind === "thematicBreak"
    ) {
      return {
        id: block.id,
        original: block.original,
        segments: [{ type: "text" as const, text: block.original }],
      };
    }
    const text = plainSegments(p.segments);
    for (const token of Object.keys(block.protected)) {
      if (text.split(token).length !== 2)
        throw new Error("代码或链接保护标记丢失或重复");
      if (p.segments.some((s) => s.type === "term" && s.text.includes(token)))
        throw new Error("保护标记不可作为学习词");
    }
    if (
      /⟦PROTECTED_\d+_\d+⟧/.test(
        text.replace(/⟦PROTECTED_\d+_\d+⟧/g, (token) =>
          token in block.protected ? "" : token,
        ),
      )
    )
      throw new Error("未知保护标记");
    const restore = (text: string) =>
      text.replace(
        /⟦PROTECTED_\d+_\d+⟧/g,
        (token) => block.protected[token] ?? token,
      );
    const segments = p.segments.map((s) =>
      s.type === "text"
        ? { ...s, text: restore(s.text) }
        : { ...s, sentence: restore(s.sentence) },
    );
    for (const s of segments)
      if (s.type === "term" && !ids.has(s.termId))
        throw new Error("出现未声明的词条");
    if (structure(plainSegments(segments)) !== structure(block.original))
      throw new Error("Markdown 标题、列表或段落结构被改变");
    if (
      JSON.stringify(protectedMarkup(plainSegments(segments))) !==
      JSON.stringify(protectedMarkup(block.original))
    )
      throw new Error("模型新增或改变了 HTML、代码、链接或图片，已拒绝保存");
    return { ...p, original: block.original, segments };
  });
  const protectedParts = Object.assign(
    {},
    ...blocks.map((b) => b.protected),
  ) as Record<string, string>;
  const restore = (text: string) =>
    text.replace(
      /⟦PROTECTED_\d+_\d+⟧/g,
      (token) => protectedParts[token] ?? token,
    );
  return {
    ...result,
    paragraphs,
    terms: result.terms.map((t) => ({
      ...t,
      example: restore(t.example),
      exampleTranslation: restore(t.exampleTranslation),
    })),
  };
}
export function chunkBlocks(blocks: SourceBlock[], max = 5000) {
  const chunks: SourceBlock[][] = [];
  let current: SourceBlock[] = [];
  let length = 0;
  for (const block of blocks) {
    if (current.length && length + block.masked.length > max) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(block);
    length += block.masked.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function sourceContainsSentence(source: string, sentence: string) {
  return source.includes(sentence) || toString(tree(source)).includes(sentence);
}
