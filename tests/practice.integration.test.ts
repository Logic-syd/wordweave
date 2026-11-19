import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { temporaryDatabase } from "./helpers/local-database";
import { db } from "../src/lib/db";
import { runAsOwner } from "../src/lib/auth-context";
import { listVocabulary, vocabularyKey } from "../src/lib/repository";
import {
  getPracticeMaterial,
  getPracticeState,
  savePracticeWord,
  saveStudyItem,
} from "../src/lib/practice-store";
import {
  practiceMaterialSchema,
  studyWriteSchema,
} from "../src/lib/practice-schemas";
import { practiceAi } from "../src/lib/practice-ai";
import { practiceSamples } from "../src/lib/practice-content";
import {
  acquireGenerationPermit,
  reserveModelRequest,
} from "../src/lib/generation-budget";

let isolated: Awaited<ReturnType<typeof temporaryDatabase>> | undefined;
beforeAll(async () => {
  isolated = await temporaryDatabase();
  vi.stubEnv("DATABASE_URL", isolated.url);
  vi.stubEnv("LLM_API_KEY", "unused-fixture-key");
  vi.stubEnv("LLM_BASE_URL", "http://127.0.0.1:9999/v1");
  vi.stubEnv("LLM_MODEL", "fixture-model");
  for (const [name, value] of Object.entries({
    GENERATION_DAILY_LIMIT: "50",
    GENERATION_DAILY_CHAR_LIMIT: "120000",
    GENERATION_GLOBAL_DAILY_LIMIT: "100",
    GENERATION_GLOBAL_DAILY_CHAR_LIMIT: "600000",
    GENERATION_MAX_CONCURRENT: "2",
    GENERATION_DAILY_MODEL_CALL_LIMIT: "100",
  }))
    vi.stubEnv(name, value);
}, 45000);
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await db.$disconnect();
  await isolated?.cleanup();
  vi.unstubAllEnvs();
});
const m = practiceMaterialSchema.parse({
  id: "shared",
  title: "Team updates",
  lang: "en",
  paragraphs: [
    {
      id: "p1",
      text: "We batch updates to reduce work.",
      zh: "我们批量处理更新以减少工作。",
    },
  ],
});
const as = <T>(owner: string, action: () => T) => runAsOwner(owner, action);
const wordInput = {
  skill: "listen" as const,
  materialId: m.id,
  paragraphId: "p1",
  form: "batch",
  meaning: "批量处理",
};
describe("one PostgreSQL vocabulary for listening, speaking, and reading", () => {
  it("reuses a reading word and keeps deliberate review state when repeated saves add practice sources", async () => {
    await as("learner", async () => {
      await saveStudyItem({ kind: "materials", id: m.id, value: m });
      const term = {
        lemma: "batch",
        meaning: "批量处理",
        partOfSpeech: "verb" as const,
      };
      const vocab = await db.vocabularyItem.create({
        data: {
          ownerId: "learner",
          key: vocabularyKey("en", term),
          language: "en",
          ...term,
          grammar: {},
          explanation: "technical context",
          example: m.paragraphs[0].text,
          exampleTranslation: m.paragraphs[0].zh,
        },
      });
      const dueAt = new Date(Date.now() + 7 * 86400000);
      await db.userVocabulary.create({
        data: {
          ownerId: "learner",
          vocabularyId: vocab.id,
          status: "KNOWN",
          exposureCount: 3,
          reviewCount: 2,
          knownStreak: 2,
          dueAt,
        },
      });
      const result = await Promise.all(
        Array.from({ length: 3 }, () =>
          savePracticeWord({ ...wordInput, vocabularyId: vocab.id }),
        ),
      );
      expect(new Set(result.map((w) => w.id))).toEqual(new Set([vocab.id]));
      await savePracticeWord({
        ...wordInput,
        skill: "speak",
        vocabularyId: vocab.id,
      });
      const words = await listVocabulary();
      expect(words).toHaveLength(1);
      expect(words[0].user).toMatchObject({
        status: "KNOWN",
        favorite: true,
        exposureCount: 5,
        reviewCount: 2,
        knownStreak: 2,
        dueAt: dueAt.toISOString(),
      });
      expect(words[0].appearances.map((a) => a.skill).sort()).toEqual([
        "listen",
        "speak",
      ]);
      expect(
        words[0].appearances.every((a) =>
          a.href?.startsWith(`/${a.skill}?material=`),
        ),
      ).toBe(true);
    });
  });
  it("does not expose another owner's materials or vocabulary, and rejects absent expressions", async () => {
    await expect(
      as("other", () => getPracticeMaterial(m.id)),
    ).rejects.toMatchObject({ status: 404 });
    expect((await as("other", getPracticeState)).materials).toHaveLength(0);
    await expect(
      as("learner", () =>
        savePracticeWord({ ...wordInput, form: "not in this source" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      as("learner", () =>
        savePracticeWord({ ...wordInput, vocabularyId: "someone-elses-word" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      as("learner", () =>
        savePracticeWord({
          skill: "listen",
          materialId: "frontend",
          paragraphId: "frontend-1",
          form: "only affects",
            meaning: practiceSamples[0].meaning!,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("keeps different meanings apart and adds only explicitly saved new words to review", async () => {
    await as("learner", async () => {
      const first = await savePracticeWord({
        ...wordInput,
        form: "work",
        meaning: "工作",
      });
      const otherSense = await savePracticeWord({
        ...wordInput,
        form: "work",
        meaning: "任务所需的计算量",
      });
      expect(first.id).not.toBe(otherSense.id);
      expect(first.user).toMatchObject({
        status: "LEARNING",
        favorite: true,
        reviewCount: 0,
        exposureCount: 1,
      });
      expect(first.user?.dueAt).toBeTruthy();
    });
  });
  it("persists independent page positions, answers, and settings; stale saves cannot erase newer input", async () => {
    await as("learner", async () => {
      const progress = {
        mid: m.id,
        pid: "p1",
        task: "listen",
        answer: "A newer answer",
        revealed: true,
        speed: 0.65,
        at: 200,
      };
      await saveStudyItem(
        studyWriteSchema.parse({
          kind: "progress",
          id: "listen",
          value: progress,
        }),
      );
      await saveStudyItem(
        studyWriteSchema.parse({
          kind: "progress",
          id: "listen",
          value: { ...progress, answer: "stale", at: 100 },
        }),
      );
      await saveStudyItem(
        studyWriteSchema.parse({
          kind: "progress",
          id: "speak",
          value: {
            ...progress,
            task: "retell",
            answer: "My spoken response",
            at: 300,
          },
        }),
      );
      const state = await getPracticeState();
      expect(state.progress.listen).toMatchObject({
        answer: "A newer answer",
        speed: 0.65,
        revealed: true,
      });
      expect(state.progress.speak?.answer).toBe("My spoken response");
      const before = (await listVocabulary()).map((w) => w.user?.reviewCount);
      await saveStudyItem(
        studyWriteSchema.parse({
          kind: "history",
          id: "h1",
          value: {
            id: "h1",
            mid: m.id,
            pid: "p1",
            skill: "listen",
            type: "listen",
            title: m.title,
            lang: "en",
            at: 300,
            answer: "I heard it",
            reference: {
              source: m.paragraphs[0].text,
              question: "",
              lang: "en",
            },
          },
        }),
      );
      expect((await getPracticeState()).history[0].answer).toBe("I heard it");
      expect((await listVocabulary()).map((w) => w.user?.reviewCount)).toEqual(
        before,
      );
    });
  });
});
const aiBody = {
  lang: "en",
  type: "listen",
  source: m.paragraphs[0].text,
  question: "",
  answer: "They batch updates.",
};
const aiRequest = (answer = aiBody.answer) =>
  new Request("http://localhost/api/practice/ai/grade", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ ...aiBody, answer }),
  });
const grade = {
  points: [
    { label: "批量处理", status: "met", explanation: "提到了批量处理更新" },
  ],
  correction: "",
  example: "They batch updates to reduce work.",
  review: [],
};
const completion = (result: unknown) =>
  Response.json({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(result) } },
    ],
  });
describe("practice model cache and the website's shared budget", () => {
  it("caches valid responses, rejects duplicate in-flight requests, and charges just one model attempt", async () => {
    let finish!: (response: Response) => void;
    const provider = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", provider);
    const first = as("ai-user", () => practiceAi(aiRequest(), "grade"));
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
    const duplicate = await as("ai-user", () =>
      practiceAi(aiRequest(), "grade"),
    );
    expect(duplicate.status).toBe(409);
    finish(completion(grade));
    expect((await first).status).toBe(200);
    const cached = await as("ai-user", () => practiceAi(aiRequest(), "grade"));
    expect(await cached.json()).toMatchObject({
      method: "ai",
      example: grade.example,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    const day = new Date().toISOString().slice(0, 10);
    expect(
      await db.generationUsage.findUnique({
        where: { ownerId_day: { ownerId: "ai-user", day } },
      }),
    ).toMatchObject({ count: 1, modelCalls: 1 });
    expect(
      await db.generationPermit.count({ where: { releasedAt: null } }),
    ).toBe(0);
  });
  it("releases failed leases so invalid output can be retried; article calls consume the same limit", async () => {
    const provider = vi
      .fn()
      .mockResolvedValueOnce(completion({ wrong: true }))
      .mockResolvedValueOnce(completion(grade));
    vi.stubGlobal("fetch", provider);
    const failed = await as("failure-user", () =>
      practiceAi(aiRequest("Retry me"), "grade"),
    );
    expect(failed.status).toBe(502);
    expect(
      await db.generationPermit.count({ where: { releasedAt: null } }),
    ).toBe(0);
    const retry = await as("failure-user", () =>
      practiceAi(aiRequest("Retry me"), "grade"),
    );
    expect(retry.status).toBe(200);
    const claim = {
      ownerId: "reader-user",
      articleId: "article-fixture",
      token: "reader-lease",
      inputChars: 80,
    };
    const release = await acquireGenerationPermit(claim);
    await reserveModelRequest(claim);
    await release();
    vi.stubEnv("GENERATION_DAILY_MODEL_CALL_LIMIT", "3");
    try {
      const capped = await as("new-user", () =>
        practiceAi(aiRequest("No budget left"), "grade"),
      );
      expect(capped.status).toBe(429);
      expect(provider).toHaveBeenCalledTimes(2);
      expect(
        await db.generationPermit.count({ where: { releasedAt: null } }),
      ).toBe(0);
    } finally {
      vi.stubEnv("GENERATION_DAILY_MODEL_CALL_LIMIT", "100");
    }
  });
});
