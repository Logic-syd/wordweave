import type { ReactNode } from "react";

const introductions = {
  listen: {
    eyebrow: "听力 · 先听，再理解 / Listen · Hear and understand",
    lead: "听一段，",
    emphasis: "抓住重点。",
    english: "Listen. Find the meaning.",
    description:
      "先听今天这一段，或带来自己的音频。听完写下重点，再对照原文。 / Start with today’s passage or your own audio. Listen, take notes, then check the transcript.",
  },
  read: {
    eyebrow: "阅读 · 在语境里学表达 / Read · Learn in context",
    lead: "读一篇，",
    emphasis: "记住表达。",
    english: "Read it. Make it yours.",
    description:
      "读懂内容，也留下值得学的表达。点击词语看释义，随时对照原文。 / Follow the story and collect useful expressions. Tap a term for its meaning or check the original.",
  },
} as const;

/** Shares the speaking page's presentation without adding a setup step. */
export function StudyIntro({
  skill,
  children,
}: {
  skill: keyof typeof introductions;
  children?: ReactNode;
}) {
  const text = introductions[skill];
  // The reading article supplies the page's h1.
  const Heading = skill === "read" ? "h2" : "h1";
  return (
    <section className="study-intro">
      <div className="study-intro-top">
        <p className="eyebrow">{text.eyebrow}</p>
        {children}
      </div>
      <Heading>
        {text.lead}
        <em>{text.emphasis}</em>
        <small lang="en">{text.english}</small>
      </Heading>
      <p className="study-description">{text.description}</p>
    </section>
  );
}
