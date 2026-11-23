import type { ReactNode } from "react";

const introductions = {
  listen: {
    title: "听力练习 / Listening",
    hint: "先听，再写下重点 / Listen, then take notes",
  },
  read: {
    title: "语境阅读 / Context reading",
    hint: "点击表达看释义 / Tap expressions for meanings",
  },
} as const;

/** A compact mode label keeps the lesson above the fold. */
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
      <Heading>{text.title}</Heading>
      <p className="study-intro-hint">{text.hint}</p>
      {children}
    </section>
  );
}
