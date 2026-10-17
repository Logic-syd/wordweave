import { temporaryDatabase } from "./helpers/local-database";
// Runs in a temporary local PostgreSQL database. Model transport is mocked;
// these tests verify persistence and failure semantics, not model language quality.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  createArticle,
  deleteArticle,
  listVocabulary,
  getArticle,
  getReviewTargets,
  updateWord,
} from "../src/lib/repository";
import { generateArticle } from "../src/lib/generation";
import {
  settingsSchema,
  termSchema,
  type Generation,
} from "../src/lib/schemas";
import { parseSource } from "../src/lib/markdown";
const { testOwner } = vi.hoisted(() => ({
  testOwner: "integration-" + crypto.randomUUID(),
}));
vi.mock("../src/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/db")>();
  return { ...actual, userScope: () => ({ ownerId: testOwner }) };
});
const ids: string[] = [];
const settings = settingsSchema.parse({});
const source =
  '# Queue\n\nState changes are queued. Use `setState(x)` carefully.\n\n```js\nconst untouched = "<code>";\n```';
const term = termSchema.parse({
  id: "queued",
  lemma: "queue",
  partOfSpeech: "verb",
  meaning: "加入队列",
  grammar: {},
  explanation: "queue 可作动词。",
  example: "State changes are queued.",
  exampleTranslation: "状态变化会加入队列。",
});
function techResult(): Generation {
  return {
    title: "队列",
    terms: [term],
    paragraphs: parseSource(source)
      .filter((b) => b.kind !== "code")
      .map((b) =>
        b.kind === "heading"
          ? { id: b.id, segments: [{ type: "text", text: "# 队列" }] }
          : {
              id: b.id,
              segments: [
                { type: "text", text: "状态变化会 " },
                {
                  type: "term",
                  text: "queued",
                  termId: "queued",
                  meaning: "加入队列",
                  sentence: term.example,
                },
                { type: "text", text: ". 请谨慎使用 ⟦PROTECTED_1_0⟧。" },
              ],
            },
      ),
  };
}
function envelope(result: unknown) {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { content: JSON.stringify(result) }, finish_reason: "stop" },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
async function article(mode = "tech", text = source) {
  const a = await createArticle(
    { title: "integration-fixture", mode, text, settings },
    randomUUID(),
  );
  ids.push(a.id);
  return a;
}

let isolatedDatabase: Awaited<ReturnType<typeof temporaryDatabase>> | undefined;
beforeAll(async () => {
  isolatedDatabase = await temporaryDatabase();
  vi.stubEnv("DATABASE_URL", isolatedDatabase.url);
  vi.stubEnv("LLM_API_KEY", "test-placeholder");
  vi.stubEnv("LLM_BASE_URL", "http://127.0.0.1:9999/v1");
  vi.stubEnv("LLM_MODEL", "test-fixture");
}, 45000);
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  const touched = await db.userVocabulary.findMany({
    where: { ownerId: testOwner },
    select: { vocabularyId: true },
  });
  await db.article.deleteMany({ where: { ownerId: testOwner } });
  await db.userVocabulary.deleteMany({ where: { ownerId: testOwner } });
  await db.languagePreference.deleteMany({ where: { ownerId: testOwner } });
  await db.vocabularyItem.deleteMany({
    where: {
      id: { in: touched.map((w) => w.vocabularyId) },
      occurrences: { none: {} },
      users: { none: {} },
    },
  });
  vi.unstubAllEnvs();
  await db.$disconnect();
  await isolatedDatabase?.cleanup();
});

describe("generation transaction with real PostgreSQL and mocked model transport", () => {
  it("saves aligned paragraphs while keeping code out of the prompt and preserving it exactly", async () => {
    const a = await article();
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => {
        void _url;
        void _init;
        return envelope(techResult());
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    await generateArticle(a.id, settings);
    const saved = await getArticle(a.id);
    expect(saved.sourceText).toBe(source);
    expect(saved.generationProgress).toBeNull();
    expect(saved.version?.paragraphs[2].segments[0].text).toBe(
      parseSource(source)[2].original,
    );
    expect(saved.version?.paragraphs.map((p) => p.sourceId)).toEqual([
      "p0001",
      "p0002",
      "p0003",
    ]);
    const prompt = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
      .messages[1].content;
    expect(prompt).not.toContain("const untouched");
    expect(prompt).not.toContain("setState(x)");
  });
  it("retains previous success on invalid model JSON and clears the generation lock", async () => {
    const a = await article();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => envelope(techResult())),
    );
    const version = await generateArticle(a.id, settings);
    const before = await db.articleVersion.count({
      where: { articleId: a.id },
    });
    const invalid = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "{broken" } }] }),
        ),
    );
    vi.stubGlobal("fetch", invalid);
    await expect(generateArticle(a.id, settings)).rejects.toMatchObject({
      status: 502,
    });
    expect(invalid).toHaveBeenCalledTimes(2);
    const saved = await db.article.findUniqueOrThrow({ where: { id: a.id } });
    expect(saved.activeVersionId).toBe(version);
    expect(saved.generationToken).toBeNull();
    expect(saved.generationProgress).toBeNull();
    expect(await db.articleVersion.count({ where: { articleId: a.id } })).toBe(
      before,
    );
  });
  it("rejects concurrent generation and creates a single successful version", async () => {
    const a = await article();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        entered();
        await gate;
        return envelope(techResult());
      }),
    );
    const first = generateArticle(a.id, settings);
    await started;
    const running = await db.article.findUniqueOrThrow({ where: { id: a.id } });
    expect(running.generationProgress).toMatchObject({
      stage: "translating",
      completed: 0,
      total: 1,
      startedAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    await expect(generateArticle(a.id, settings)).rejects.toMatchObject({
      status: 409,
    });
    release();
    await first;
    expect(await db.articleVersion.count({ where: { articleId: a.id } })).toBe(
      1,
    );
  });
  it("does not overwrite a newer generation claim when an old worker reports progress", async () => {
    const a = await article();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        entered();
        await gate;
        return envelope(techResult());
      }),
    );
    const original = generateArticle(a.id, settings);
    await started;
    const newerToken = randomUUID();
    const newerProgress = {
      stage: "preparing",
      completed: 0,
      total: 0,
      message: "newer generation",
    };
    await db.article.update({
      where: { id: a.id },
      data: { generationToken: newerToken, generationProgress: newerProgress },
    });
    const rejected = expect(original).rejects.toMatchObject({ status: 409 });
    release();
    await rejected;
    const saved = await db.article.findUniqueOrThrow({ where: { id: a.id } });
    expect(saved.generationToken).toBe(newerToken);
    expect(saved.generationProgress).toEqual(newerProgress);
    expect(saved.activeVersionId).toBeNull();
    expect(
      await db.generationPermit.count({
        where: { articleId: a.id, releasedAt: null },
      }),
    ).toBe(0);
  });
  it("clears the article claim without contacting the model when generation quota denies the request", async () => {
    const a = await article();
    const previous = process.env.GENERATION_DAILY_LIMIT;
    vi.stubEnv("GENERATION_DAILY_LIMIT", "0");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(generateArticle(a.id, settings)).rejects.toMatchObject({
        status: 429,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      const saved = await db.article.findUniqueOrThrow({ where: { id: a.id } });
      expect(saved.generationToken).toBeNull();
      expect(saved.generationProgress).toBeNull();
      expect(saved.generationError).toContain("停用");
    } finally {
      vi.stubEnv("GENERATION_DAILY_LIMIT", previous);
    }
  });
  it("keeps explicitly favorited words and review history after deleting their only article", async () => {
    const a = await article();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => envelope(techResult())),
    );
    await generateArticle(a.id, settings);
    const current = await getArticle(a.id);
    const wordId = current.version!.occurrences[0].vocabularyId;
    await updateWord(wordId, { favorite: true });
    await deleteArticle(a.id);
    const retained = (await listVocabulary()).find((w) => w.id === wordId);
    expect(retained?.user.favorite).toBe(true);
    expect(retained?.user.status).toBe("LEARNING");
    expect(retained?.appearances.some((o) => o.articleId === a.id)).toBe(false);
  });
  it("reports API denial without storing the key or corrupting source", async () => {
    const a = await article();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    await expect(generateArticle(a.id, settings)).rejects.toMatchObject({
      status: 502,
    });
    const saved = await db.article.findUniqueOrThrow({ where: { id: a.id } });
    expect(saved.generationError).toContain("API Key");
    expect(saved.generationError).not.toContain("test-placeholder");
    expect(saved.sourceText).toBe(source);
  });
  it("honors three new words and includes an explicitly due review word, without declaring mastery", async () => {
    const kasse = await db.vocabularyItem.create({
      data: {
        ownerId: testOwner,
        key: randomUUID(),
        language: "de",
        lemma: "Kasse",
        partOfSpeech: "noun",
        meaning: "收银台",
        grammar: { article: "die", plural: "die Kassen" },
        explanation: "结账的位置。",
        example: "An der Kasse ist es ruhig.",
        exampleTranslation: "收银台很安静。",
      },
    });
    await db.userVocabulary.createMany({
      data: { ownerId: testOwner, vocabularyId: kasse.id },
      skipDuplicates: true,
    });
    const previous = await db.userVocabulary.findUniqueOrThrow({
      where: {
        ownerId_vocabularyId: { ownerId: testOwner, vocabularyId: kasse.id },
      },
    });
    try {
      await updateWord(kasse.id, { status: "LEARNING", favorite: true });
      expect((await getReviewTargets()).some((w) => w.id === kasse.id)).toBe(
        true,
      );
      const a = await article("german", "");
      const fresh = ["Bahnhof", "Fahrkarte", "Gleis"].map((lemma, i) => ({
        ...term,
        id: `new${i}`,
        lemma,
        partOfSpeech: "noun" as const,
        grammar: {
          ...term.grammar,
          article: i === 1 ? "die" : i === 2 ? "das" : "der",
          plural: ["die Bahnhöfe", "die Fahrkarten", "die Gleise"][i],
        },
        meaning: ["火车站", "车票", "站台轨道"][i],
      }));
      const review = {
        ...term,
        id: "review",
        lemma: "Kasse",
        meaning: "收银台",
        partOfSpeech: "noun" as const,
        grammar: { ...term.grammar, article: "die", plural: "die Kassen" },
        reviewVocabularyId: kasse.id,
      };
      const result: Generation = {
        title: "车站的早晨",
        terms: [...fresh, review],
        paragraphs: [
          {
            id: "p0001",
            original:
              "Am Bahnhof kaufe ich eine Fahrkarte. Am Gleis wartet eine Frau. An der Kasse ist es ruhig.",
            segments: [
              ...fresh.map((t) => ({
                type: "term" as const,
                text: t.lemma,
                termId: t.id,
                meaning: t.meaning,
                sentence: "Am Bahnhof kaufe ich eine Fahrkarte.",
              })),
              {
                type: "term",
                text: "Kasse",
                termId: "review",
                meaning: "收银台",
                grammarNote: "本句 an der Kasse 使用第三格。",
                sentence: "An der Kasse ist es ruhig.",
              },
            ],
          },
        ],
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => envelope(result)),
      );
      await generateArticle(a.id, { ...settings, newWordCount: 3 });
      const saved = await getArticle(a.id);
      expect(saved.version?.coverage.newWords).toHaveLength(3);
      expect(saved.version?.coverage.reviewWords).toContain("Kasse");
      expect(
        saved.version?.occurrences.find((o) => o.word.lemma === "Kasse")?.word
          .user?.status,
      ).toBe("LEARNING");
      expect(
        saved.version?.occurrences.filter((o) => o.targetKind === "new"),
      ).toHaveLength(3);
      expect(
        saved.version?.occurrences.find((o) => o.word.lemma === "Kasse")?.word
          .grammar.note,
      ).toBe("本句 an der Kasse 使用第三格。");
    } finally {
      const { id, ...data } = previous;
      await db.userVocabulary.update({ where: { id }, data });
    }
  });
});
