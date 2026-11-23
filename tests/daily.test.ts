import { describe, it, expect } from "vitest";
import {
  dailyLesson,
  dailyReading,
  dayNumber,
  localDay,
  readingPicks,
  speakingPicks,
} from "../src/lib/daily";
import { getSample } from "../src/lib/samples";
import { practiceMaterialSchema } from "../src/lib/practice-schemas";
import {
  MAX_AUDIO_BYTES,
  validateAudio,
} from "../src/lib/practice-audio-store";
import { lessonHref, lessonKey } from "../src/lib/saved-lessons";

describe("daily editorial schedule", () => {
  it("defaults to English every day and keeps German in an explicit separate rotation", () => {
    for (let i = 0; i < 30; i++) {
      const day = new Date(Date.UTC(2026, 10, 20 + i))
        .toISOString()
        .slice(0, 10);
      expect(getSample(dailyLesson(day).reading)?.mode).toBe("tech");
      expect(getSample(dailyReading(day, "de"))?.mode).toBe("german");
      expect(dailyReading(day, "en")).toBe(dailyLesson(day).reading);
    }
  });
  it("is stable on a calendar date and changes all three picks the next day", () => {
    expect(dailyLesson("2026-11-20")).toEqual(dailyLesson("2026-11-20"));
    const today = dailyLesson("2026-11-20"),
      next = dailyLesson("2026-11-21");
    expect(today.reading).not.toBe(next.reading);
    expect(today.listening.id).not.toBe(next.listening.id);
    expect(today.speaking.id).not.toBe(next.speaking.id);
    expect(localDay(new Date(2026, 10, 20, 23, 59))).toBe("2026-11-20");
  });
  it("uses calendar days across DST and validates dates instead of normalizing them", () => {
    expect(dayNumber("2026-03-30") - dayNumber("2026-03-29")).toBe(1);
    expect(dayNumber("2026-10-26") - dayNumber("2026-10-25")).toBe(1);
    expect(() => dailyLesson("2026-02-30")).toThrow();
    expect(() => dailyLesson("not-a-date")).toThrow();
    expect(dailyLesson("2026-11-19").reading).toBeTruthy();
  });
  it("only selects existing reading, complete speaking passages and real listening questions", () => {
    for (const id of readingPicks)
      expect(getSample(id)?.version?.paragraphs.length).toBeGreaterThan(1);
    expect(new Set(speakingPicks.map((x) => x.id)).size).toBe(
      speakingPicks.length,
    );
    for (let i = 0; i < 60; i++) {
      const day = new Date(Date.UTC(2026, 10, 20 + i))
        .toISOString()
        .slice(0, 10);
      const lesson = dailyLesson(day);
      expect(
        lesson.speaking.text.split(/[.!?]/).filter((s) => s.trim()).length,
      ).toBeGreaterThanOrEqual(5);
      expect(
        lesson.listening.paragraphs.some(
          (p) => p.id === lesson.paragraph && p.text,
        ),
      ).toBe(true);
      expect(lesson.listening.question).toBeTruthy();
    }
  });
  it("keeps bookmarks separate by skill and encodes their links", () => {
    const lesson = {
      skill: "listen" as const,
      title: "Test",
      contentId: "x&evil=1",
      paragraph: "p1",
    };
    expect(lessonHref(lesson)).toBe(
      "/listen?material=x%26evil%3D1&paragraph=p1",
    );
    expect(lessonKey(lesson)).not.toBe(
      lessonKey({ ...lesson, skill: "speak" }),
    );
  });
});
describe("local listening audio", () => {
  it("rejects empty, oversized and non-audio input", () => {
    expect(() =>
      validateAudio({ name: "test.wav", size: 100, type: "audio/wav" }),
    ).not.toThrow();
    for (const input of [
      { name: "empty.mp3", size: 0, type: "audio/mpeg" },
      { name: "big.mp3", size: MAX_AUDIO_BYTES + 1, type: "audio/mpeg" },
      { name: "page.html", size: 100, type: "text/html" },
      { name: "fake.wav", size: 100, type: "text/html" },
    ])
      expect(() => validateAudio(input)).toThrow();
  });
  it("allows an absent transcript only when the material has audio", () => {
    const material = {
      id: "custom:audio",
      title: "My recording",
      lang: "en",
      paragraphs: [{ id: "p1", text: "" }],
    };
    expect(practiceMaterialSchema.safeParse(material).success).toBe(false);
    expect(
      practiceMaterialSchema.safeParse({
        ...material,
        audio: { id: "blob", name: "sample.wav", size: 100, type: "audio/wav" },
      }).success,
    ).toBe(true);
  });
});
