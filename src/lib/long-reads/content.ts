import type { Term } from "../schemas";

export type LongRead = {
  key: string;
  title: string;
  // Each pair is exactly one Markdown block, with its corresponding learning text.
  blocks: [english: string, learning: string][];
  terms: Term[];
};

export function expression(
  id: string,
  lemma: string,
  meaning: string,
  example: string,
  exampleTranslation: string,
  explanation: string,
  category: "general" | "technical" = "general",
): Term {
  return {
    id,
    lemma,
    meaning,
    example,
    exampleTranslation,
    explanation,
    category,
    partOfSpeech: "phrase",
    grammar: {
      article: "",
      plural: "",
      infinitive: "",
      currentForm: "",
      note: "",
    },
  };
}
