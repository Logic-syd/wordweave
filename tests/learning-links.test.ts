import { describe, expect, it } from "vitest";
import { learningAppearance } from "../src/lib/learning-links";
import type { VocabularyView } from "../src/lib/types";

const original: VocabularyView["appearances"][number] = {
  skill: "read",
  articleId: "readalong:old-article",
  sourceId: "s12",
  title: "My article",
  form: "coffee",
  sentence: "We ordered coffee.",
  href: "/read?article=old-article&sentence=12#exercise",
};
describe("saved learning sources after restoring contextual reading", () => {
  it("keeps the sentence and fixes the source category without mutating saved data", () => {
    expect(learningAppearance(original)).toEqual({
      ...original,
      skill: "speak",
      href: "/speak?article=old-article&sentence=12#exercise",
    });
    expect(original.skill).toBe("read");
  });
  it("retains legacy speaking material links and leaves contextual articles intact", () => {
    const practice = {
      ...original,
      articleId: "practice-coffee",
      skill: "speak" as const,
      href: "/speak?material=practice-coffee&paragraph=p1",
    };
    expect(learningAppearance(practice).href).toBe(
      "/speak/practice?material=practice-coffee&paragraph=p1",
    );
    const reading = {
      ...original,
      articleId: "sample-react-state-v1",
      href: "/read/sample-react-state-v1#p0001",
    };
    expect(learningAppearance(reading)).toBe(reading);
  });
});
