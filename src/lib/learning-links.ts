import type { VocabularyView } from "./types";

export const practicePath = (skill: "listen" | "speak") =>
  skill === "speak" ? "/speak/practice" : "/listen";

/** Resolve saved sources without replacing their word IDs or learning state. */
export function learningAppearance(
  appearance: VocabularyView["appearances"][number],
): VocabularyView["appearances"][number] {
  if (appearance.articleId.startsWith("readalong:")) {
    const query = new URLSearchParams({
      article: appearance.articleId.slice("readalong:".length),
      sentence: /^s\d+$/.test(appearance.sourceId)
        ? appearance.sourceId.slice(1)
        : "0",
    });
    return { ...appearance, skill: "speak", href: `/speak?${query}#exercise` };
  }
  if (appearance.skill === "speak" && appearance.href?.startsWith("/speak?"))
    return {
      ...appearance,
      href: appearance.href.replace("/speak?", "/speak/practice?"),
    };
  return appearance;
}
