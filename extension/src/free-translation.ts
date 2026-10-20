import { toString } from "mdast-util-to-string";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { SourceBlock } from "../../src/lib/markdown";
import type { Generation, Segment, Term } from "../../src/lib/schemas";
import type { Retention } from "./protocol";
import { requestJson, requestQueue, TranslationError } from "./translation-network";

export const FREE_TRANSLATION_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const parser = unified().use(remarkParse);
const expressionPatterns = [
  /\bavoid(?:s|ed|ing)? unnecessary (?:re-renders|renders|requests|work|updates|complexity)\b/gi,
  /\bintroduc(?:e|es|ed|ing) (?:a )?breaking changes?\b/gi,
  /\b(?:take|takes|taking) (?:advantage of|into account)\b/gi,
  /\b(?:keep|keeps|keeping) (?:in mind|track of)\b/gi,
  /\b(?:trade[- ]offs?|backward compatibility|backwards compatibility|breaking changes?|race conditions?|state updates?|side effects?|event loop|call stack|memory leaks?|garbage collection|dependency injection|error handling|type safety|type inference|type checking|runtime errors?|compile time|run time|build time|source code|open source|pull requests?|code review|unit tests?|integration tests?|end-to-end tests?|test coverage|design patterns?|data structures?|time complexity|space complexity|performance bottlenecks?|rendering performance|user experience|edge cases?|use cases?|single source of truth|separation of concerns|higher[- ]order functions?|pure functions?|immutable data|mutable state|asynchronous operations?|concurrent requests?|lazy loading|code splitting|tree shaking|server[- ]side rendering|client[- ]side rendering|static analysis|continuous integration|continuous deployment|version control|distributed systems?|load balancing|rate limiting|request lifecycle|connection pooling|database transactions?|database queries|query optimization|access control|security vulnerabilities|environment variables|configuration files?|command line|standard library|public API|return values?|default values?|function calls?|function parameters?|optional parameters?|reference types?|primitive types?|strict mode|object references?|event handlers?|event listeners?|callback functions?|promise chains?|async functions?|nested loops?|infinite loops?|network requests?|HTTP requests?|response headers?|request headers?|response body|request body|cache invalidation|data fetching|data flow|state management|business logic|technical debt|best practices|common pitfalls|root cause|implementation details|under the hood|out of the box|in practice|in contrast|as a result|in other words|on the other hand|in terms of|at the same time|for instance|for example)\b/gi,
];

type Candidate = { text: string; sentence: string };
export function selectExpressions(block: SourceBlock, retention: Retention): Candidate[] {
  // Protected code/link contents are excluded from rules and never become terms.
  const prose = toString(parser.parse(block.masked)).replace(/⟦PROTECTED_\d+_\d+⟧/g, " ");
  const plainOriginal = toString(parser.parse(block.original));
  const sentences = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(plainOriginal), (part) => part.segment.trim());
  const found: { text: string; start: number; end: number; sentence: string }[] = [];
  for (const pattern of expressionPatterns) {
    pattern.lastIndex = 0;
    for (const match of prose.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (found.some((other) => start < other.end && end > other.start)) continue;
      const sentence = sentences.find((part) => part.includes(match[0]));
      if (!sentence || sentence.length > 2000) continue;
      found.push({ text: match[0], start, end, sentence });
    }
  }
  const unique = [...new Map(found.sort((a, b) => a.start - b.start).map((item) => [item.text.toLowerCase(), item])).values()];
  return unique.slice(0, { low: 1, medium: 2, high: 3 }[retention]);
}

/** Split at sentence/word boundaries without losing or silently truncating text. */
export function splitTranslationText(text: string, max = 1400): string[] {
  const result: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const window = remaining.slice(0, max + 1);
    const sentence = [...window.matchAll(/[.!?]\s+/g)].at(-1);
    let end = sentence ? sentence.index! + sentence[0].length : window.lastIndexOf(" ");
    if (end < max / 3) end = max;
    // The fallback must not split an opaque code/link protection marker.
    const markerStart = remaining.lastIndexOf("ZXQWW", end);
    const markerEnd = markerStart >= 0 ? remaining.indexOf("QXZ", markerStart) + 3 : 0;
    if (markerStart >= 0 && markerStart < end && markerEnd > end) end = markerStart || markerEnd;
    result.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) result.push(remaining);
  return result;
}

function googleText(value: unknown): string {
  if (!Array.isArray(value) || !Array.isArray(value[0]) || !value[0].length)
    throw new TranslationError("免费翻译返回格式不兼容，请稍后重试。不会自动切换到付费 AI。");
  const lines = value[0] as unknown[];
  if (lines.some((line) => !Array.isArray(line) || typeof line[0] !== "string"))
    throw new TranslationError("免费翻译返回格式不兼容，请稍后重试。不会自动切换到付费 AI。");
  const text = (lines as string[][]).map((line) => line[0]).join("");
  if (!text.trim()) throw new TranslationError("免费翻译返回了空内容。请稍后重试。");
  return text;
}

export async function freeTranslation(
  blocks: SourceBlock[], retention: Retention, fetcher: typeof fetch,
  onProgress?: (completed: number, total: number) => void,
): Promise<Generation> {
  const queue = requestQueue(2);
  const controller = new AbortController();
  const phraseCache = new Map<string, Promise<string>>();
  // Limit extra glossary calls. Unselected paragraphs still receive full translation.
  const candidates = new Map<string, Candidate[]>();
  let allowance = { low: 3, medium: 6, high: 10 }[retention];
  for (const block of blocks) {
    const chosen = block.kind === "code" ? [] : selectExpressions(block, retention).slice(0, allowance);
    candidates.set(block.id, chosen);
    allowance -= chosen.length;
  }
  const translate = async (text: string) => {
    const parts: string[] = [];
    for (const piece of splitTranslationText(text)) {
      if (controller.signal.aborted) throw new TranslationError("免费翻译已停止，请重试。");
      parts.push(await queue(async () => {
        if (controller.signal.aborted) throw new TranslationError("免费翻译已停止，请重试。");
        const url = new URL(FREE_TRANSLATION_ENDPOINT);
        url.search = new URLSearchParams({ client: "gtx", sl: "en", tl: "zh-CN", dt: "t", q: piece }).toString();
        return googleText(await requestJson(fetcher, url, { method: "GET" }, {
          timeout: 30000, limit: 256 * 1024, label: "免费翻译", signal: controller.signal,
        }));
      }));
    }
    return parts.join("");
  };
  let completed = 0;
  onProgress?.(0, blocks.length);
  const terms: Term[] = [];
  const paragraphs = await Promise.all(blocks.map(async (block, index) => {
    try {
      if (["code", "html", "definition", "thematicBreak"].includes(block.kind)) {
        onProgress?.(++completed, blocks.length);
        return { id: block.id, original: block.original, segments: [{ type: "text" as const, text: block.original }] };
      }
      if (!/[a-zA-Z]/.test(block.masked.replace(/⟦PROTECTED_\d+_\d+⟧/g, ""))) {
        onProgress?.(++completed, blocks.length);
        return { id: block.id, original: block.original, segments: [{ type: "text" as const, text: block.masked }] };
      }
      const nonce = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
      const placeholders = Object.keys(block.protected).map((token, i) => ({ token, marker: `ZXQWW${nonce}P${i}QXZ` }));
      let masked = block.masked;
      for (const { token, marker } of placeholders) masked = masked.replace(token, marker);
      const heading = block.kind === "heading" ? masked.match(/^#{1,6}\s+/)?.[0] ?? "" : "";
      let chinese = heading + await translate(masked.slice(heading.length));
      for (const { token, marker } of placeholders) {
        // Accept case changes or inserted whitespace, but never a missing/repeated marker.
        const pattern = new RegExp(marker.split("").join("\\s*"), "gi");
        if ([...chinese.matchAll(pattern)].length !== 1)
          throw new TranslationError("免费翻译改变了代码或链接保护标记，已保留原文。请重试或选择较短段落。");
        chinese = chinese.replace(pattern, token);
      }
      const glossary = await Promise.all((candidates.get(block.id) ?? []).map(async (candidate) => {
        const key = candidate.text.toLowerCase();
        if (!phraseCache.has(key)) phraseCache.set(key, translate(candidate.text));
        return { ...candidate, meaning: (await phraseCache.get(key)!).trim().replace(/[。.!！]$/, "") };
      }));
      const matches: { start: number; end: number; candidate: typeof glossary[number] }[] = [];
      for (const candidate of glossary) {
        // Exact and unique alignment only. Do not guess where a different sense belongs.
        if (!/[\u3400-\u9fff]/.test(candidate.meaning) || candidate.meaning.length > 300) continue;
        const start = chinese.indexOf(candidate.meaning);
        if (start < 0 || chinese.indexOf(candidate.meaning, start + candidate.meaning.length) >= 0) continue;
        const end = start + candidate.meaning.length;
        if (matches.some((match) => start < match.end && end > match.start)) continue;
        matches.push({ start, end, candidate });
      }
      const segments: Segment[] = [];
      let cursor = 0;
      for (const [termIndex, match] of matches.sort((a, b) => a.start - b.start).entries()) {
        if (match.start > cursor) segments.push({ type: "text", text: chinese.slice(cursor, match.start) });
        const { candidate } = match;
        const termId = `f${index}_${termIndex}`;
        segments.push({ type: "term", text: candidate.text, termId, meaning: candidate.meaning, sentence: candidate.sentence });
        terms.push({
          id: termId, lemma: candidate.text.toLowerCase(), partOfSpeech: "phrase", meaning: candidate.meaning,
          grammar: { article: "", plural: "", infinitive: "", currentForm: "", note: "" },
          explanation: "免费翻译 · 规则筛选的英文表达；释义来自传统机器翻译，并与本段译文精确匹配。未使用 AI 分析语法，请结合原句理解。",
          example: candidate.sentence, exampleTranslation: "", category: "general",
        });
        cursor = match.end;
      }
      if (cursor < chinese.length || !segments.length) segments.push({ type: "text", text: chinese.slice(cursor) });
      onProgress?.(++completed, blocks.length);
      return { id: block.id, original: block.original, segments };
    } catch (error) {
      controller.abort();
      throw error;
    }
  }));
  return { title: "免费翻译", terms, paragraphs };
}
