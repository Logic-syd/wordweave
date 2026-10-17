import { describe, expect, it } from "vitest";
import {
  parseSource,
  restoreAndValidate,
  chunkBlocks,
  sourceContainsSentence,
} from "../src/lib/markdown";
import { generationSchema, termSchema } from "../src/lib/schemas";
const source =
  '# A title\n\nDo not change `const x = 2` or [this link](https://example.com/a?b=1).\n\n```ts\nconst secret = "<hello>";\n// Preserve spacing.\n```\n\n- First item\n- Second item';
function response(blocks: ReturnType<typeof parseSource>) {
  return generationSchema.parse({
    title: "标题",
    terms: [],
    paragraphs: blocks.map((b) => ({
      id: b.id,
      segments: [
        {
          type: "text",
          text: b.masked
            .replace("Do not change", "不要改变")
            .replace("A title", "标题")
            .replace("First item", "第一项")
            .replace("Second item", "第二项"),
        },
      ],
    })),
  });
}
describe("Markdown protection", () => {
  it("keeps fenced code and inline code byte-for-byte, with stable IDs and links", () => {
    const blocks = parseSource(source);
    expect(blocks.map((b) => b.id)).toEqual([
      "p0001",
      "p0002",
      "p0003",
      "p0004",
    ]);
    expect(blocks[1].masked).not.toContain("const x");
    expect(blocks[2].masked).not.toContain("secret");
    const result = restoreAndValidate(response(blocks), blocks);
    expect(result.paragraphs[2].segments[0].text).toBe(blocks[2].original);
    expect(result.paragraphs[1].segments[0].text).toContain("`const x = 2`");
    expect(result.paragraphs[1].segments[0].text).toContain(
      "[this link](https://example.com/a?b=1)",
    );
  });
  it("rejects lost, duplicated, or unknown protection markers and rearranged paragraphs", () => {
    const blocks = parseSource(source);
    const result = response(blocks);
    result.paragraphs[1].segments = [{ type: "text", text: "被截断了" }];
    expect(() => restoreAndValidate(result, blocks)).toThrow(/保护标记/);
    const other = response(blocks);
    other.paragraphs.reverse();
    expect(() => restoreAndValidate(other, blocks)).toThrow(/ID/);
  });
  it("preserves nested code, ordered lists, and blockquotes; rejects layout changes", () => {
    const blocks = parseSource(
      "1. Example:\n\n   ```js\n   run();\n   ```\n2. Next\n\n> A quote",
    );
    const result = restoreAndValidate(response(blocks), blocks);
    expect(result.paragraphs[0].segments[0].text).toContain("   run();");
    const broken = response(blocks);
    broken.paragraphs[0].segments = [{ type: "text", text: "Changed layout" }];
    expect(() => restoreAndValidate(broken, blocks)).toThrow();
  });
  it("chunks every block in order without silently truncating oversized blocks", () => {
    const blocks = parseSource(
      Array.from(
        { length: 12 },
        (_, i) => `Paragraph ${i} ` + "x".repeat(1100),
      ).join("\n\n"),
    );
    const chunks = chunkBlocks(blocks, 2400);
    expect(chunks.length).toBe(6);
    expect(chunks.flat().map((b) => b.original)).toEqual(
      blocks.map((b) => b.original),
    );
    expect(
      chunkBlocks(parseSource("x".repeat(8000)), 2000)[0][0].original.length,
    ).toBe(8000);
  });
  it("restores protected inline code inside original sentences and example fields", () => {
    const source = "Use `setCount()` to batch updates.";
    const blocks = parseSource(source);
    const term = termSchema.parse({
      id: "batch",
      lemma: "batch updates",
      partOfSpeech: "phrase",
      meaning: "批量更新",
      grammar: {},
      explanation: "按批次处理更新",
      example: "Use ⟦PROTECTED_0_0⟧ to batch updates.",
      exampleTranslation: "使用计数器进行批量更新。",
    });
    const result = restoreAndValidate(
      {
        title: "更新",
        terms: [term],
        paragraphs: [
          {
            id: "p0001",
            segments: [
              { type: "text", text: "使用 ⟦PROTECTED_0_0⟧ 来 " },
              {
                type: "term",
                text: "batch updates",
                termId: "batch",
                meaning: "批量更新",
                sentence: term.example,
              },
            ],
          },
        ],
      },
      blocks,
    );
    expect(result.terms[0].example).toBe(source);
    expect(result.paragraphs[0].segments[1]).toMatchObject({
      sentence: source,
    });
    expect(
      sourceContainsSentence(
        "React **batches** updates.",
        "React batches updates.",
      ),
    ).toBe(true);
  });
  it("protects reference-style links and their original destinations", () => {
    const blocks = parseSource(
      "Read [the manual][docs].\n\n[docs]: https://react.dev/learn",
    );
    expect(Object.values(blocks[0].protected)).toContain("[the manual][docs]");
    const result = restoreAndValidate(response(blocks), blocks);
    expect(result.paragraphs[0].segments[0].text).toContain(
      "[the manual][docs]",
    );
    expect(result.paragraphs[1].segments[0].text).toBe(
      "[docs]: https://react.dev/learn",
    );
  });
});
