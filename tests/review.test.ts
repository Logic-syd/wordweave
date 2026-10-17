import { describe, expect, it } from "vitest";
import {
  normalizeLemma,
  reviewUpdate,
  selectReviewWords,
} from "../src/lib/review";
const now = new Date("2026-10-17T12:00:00Z");
describe("review scheduling", () => {
  it("selects only explicitly learning/known due words, oldest first, never exposure alone", () => {
    const base = { favorite: false, knownStreak: 0 };
    const words = [
      { ...base, vocabularyId: "new", status: "NEW", dueAt: now },
      { ...base, vocabularyId: "ignored", status: "IGNORED", dueAt: now },
      {
        ...base,
        vocabularyId: "future",
        status: "KNOWN",
        dueAt: new Date("2026-10-19"),
      },
      { ...base, vocabularyId: "learning", status: "LEARNING", dueAt: now },
      {
        ...base,
        vocabularyId: "old",
        status: "KNOWN",
        dueAt: new Date("2026-10-12"),
      },
    ];
    expect(selectReviewWords(words, now).map((w) => w.vocabularyId)).toEqual([
      "old",
      "learning",
    ]);
  });
  it("uses 1, 3, 7, 14, 30 days for explicit known, resets for still learning", () => {
    expect(
      [0, 1, 2, 3, 4, 20].map(
        (n) =>
          (reviewUpdate("KNOWN", n, now).dueAt!.getTime() - now.getTime()) /
          86400000,
      ),
    ).toEqual([1, 3, 7, 14, 30, 30]);
    expect(reviewUpdate("LEARNING", 4, now)).toMatchObject({
      knownStreak: 0,
      dueAt: now,
    });
    expect(reviewUpdate("IGNORED", 3, now).dueAt).toBeNull();
  });
  it("normalizes articles/case without merging inflected verbs blindly", () => {
    expect(normalizeLemma(" der Supermarkt ", "de")).toBe(
      normalizeLemma("Supermarkt", "de"),
    );
    expect(normalizeLemma("BEZAHLEN", "de")).toBe("bezahlen");
    expect(normalizeLemma("bezahle", "de")).not.toBe(
      normalizeLemma("bezahlen", "de"),
    );
  });
});
