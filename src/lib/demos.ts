import { db } from "./db";
import { parseSource } from "./markdown";
import { settingsSchema, type Generation } from "./schemas";
import { saveVersion } from "./repository";
import { demoSegments, originalDemos } from "./demo-content";
export { germanOriginal } from "./demo-content";
export async function seedDemos() {
  for (const data of originalDemos) {
    const existing = await db.article.findUnique({
      where: { demoKey: data.key },
    });
    if (existing?.activeVersionId) continue;
    const blocks = parseSource(data.source);
    const article =
      existing ??
      (await db.article.create({
        data: {
          demoKey: data.key,
          title: data.title,
          mode: data.mode,
          language: data.language,
          origin: data.origin,
          sourceText: data.source,
          sourceBlocks: JSON.parse(JSON.stringify(blocks)),
          ...(data.mode === "tech"
            ? {
                sourceUrl:
                  "https://react.dev/learn/queueing-a-series-of-state-updates",
              }
            : {}),
        },
      }));
    const token = "demo-seed";
    await db.article.update({
      where: { id: article.id },
      data: { generationToken: token },
    });
    const result: Generation = {
      title: data.title,
      terms: data.terms,
      paragraphs: blocks.map((b, i) => ({
        id: b.id,
        original: b.original,
        segments: demoSegments(
          data.learning[i] || b.original,
          data.terms,
          b.original,
        ),
      })),
    };
    await saveVersion(
      article.id,
      token,
      result,
      settingsSchema.parse({}),
      {
        newWords: data.terms.map((t) => t.lemma),
        reviewWords: [],
        requestedNew: 5,
        requestedReview: 0,
        missing: [],
      },
      [],
      { savePreferences: false },
    );
  }
}
