export type ReviewCandidate = {
  vocabularyId: string;
  status: string;
  dueAt: Date | null;
  favorite: boolean;
  knownStreak: number;
};
export function selectReviewWords<T extends ReviewCandidate>(
  items: T[],
  now = new Date(),
  limit = 3,
): T[] {
  return items
    .filter(
      (i) =>
        ["LEARNING", "KNOWN"].includes(i.status) &&
        i.dueAt !== null &&
        i.dueAt <= now,
    )
    .sort(
      (a, b) =>
        a.dueAt!.getTime() - b.dueAt!.getTime() ||
        Number(b.favorite) - Number(a.favorite) ||
        a.vocabularyId.localeCompare(b.vocabularyId),
    )
    .slice(0, limit);
}
export function reviewUpdate(
  status: "LEARNING" | "KNOWN" | "IGNORED",
  streak: number,
  now = new Date(),
) {
  const knownStreak = status === "KNOWN" ? streak + 1 : 0;
  const days = [1, 3, 7, 14, 30][Math.min(knownStreak - 1, 4)];
  return {
    status,
    knownStreak,
    dueAt:
      status === "IGNORED"
        ? null
        : status === "LEARNING"
          ? now
          : new Date(now.getTime() + days * 86400000),
    lastReviewedAt: now,
  };
}
export function normalizeLemma(value: string, language: string) {
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return language === "de"
    ? text.replace(/^(der|die|das)\s+/i, "").toLocaleLowerCase("de")
    : text.toLocaleLowerCase("en");
}
