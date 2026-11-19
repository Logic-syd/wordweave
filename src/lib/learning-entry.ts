export type LearningSkill = "listen" | "speak" | "read";
const skillKey = "wordweave.last-skill";
const readingKey = "wordweave.last-reading";
export function lastSkill(): LearningSkill {
  try {
    const value = localStorage.getItem(skillKey);
    return value === "speak" || value === "read" ? value : "listen";
  } catch {
    return "listen";
  }
}
export function rememberSkill(skill: LearningSkill) {
  try {
    localStorage.setItem(skillKey, skill);
  } catch {
    /* Learning remains available without storage. */
  }
}
export function rememberReading(id: string) {
  if (!/^(sample-|local-article-)[\w-]+$/.test(id)) return;
  try {
    localStorage.setItem(readingKey, id);
  } catch {
    /* Do not interrupt reading. */
  }
}
export function lastReading() {
  try {
    return localStorage.getItem(readingKey);
  } catch {
    return null;
  }
}
