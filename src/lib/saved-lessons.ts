import { z } from "zod";
import { browserData } from "./browser-store";
export const savedLessonSchema = z.object({
  skill: z.enum(["read", "listen", "speak"]),
  contentId: z.string().min(1).max(180),
  paragraph: z.string().max(180).optional(),
  title: z.string().min(1).max(150),
  savedAt: z.string(),
});
export type SavedLesson = z.infer<typeof savedLessonSchema>;
export type Lesson = Omit<SavedLesson, "savedAt">;
export const lessonKey = (lesson: Lesson) =>
  `${lesson.skill}:${lesson.contentId}:${lesson.paragraph ?? ""}`;
export function lessonHref(lesson: Lesson) {
  if (lesson.skill === "read")
    return `/read/${encodeURIComponent(lesson.contentId)}`;
  if (lesson.skill === "speak")
    return `/speak?article=${encodeURIComponent(lesson.contentId)}#exercise`;
  const params = new URLSearchParams({ material: lesson.contentId });
  if (lesson.paragraph) params.set("paragraph", lesson.paragraph);
  return `/listen?${params}`;
}
export async function savedLessons() {
  return browserData(false, (d) =>
    (d.savedLessons ?? []).flatMap((value) => {
      const parsed = savedLessonSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }),
  );
}
export async function saveLesson(lesson: Lesson) {
  const value = savedLessonSchema.parse({
    ...lesson,
    savedAt: new Date().toISOString(),
  });
  return browserData(true, (d) => {
    const saved = d.savedLessons ?? [];
    if (saved.some((item) => lessonKey(item) === lessonKey(value))) return;
    if (saved.length >= 500)
      throw new Error(
        "收藏已达 500 条，请先整理。 / Your library has 500 items. Remove a few first.",
      );
    d.savedLessons = [value, ...saved];
  });
}
export async function removeSavedLesson(lesson: Lesson) {
  return browserData(true, (d) => {
    d.savedLessons = (d.savedLessons ?? []).filter(
      (item) => lessonKey(item) !== lessonKey(lesson),
    );
  });
}
