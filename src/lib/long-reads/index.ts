import { reactLongRead } from "./react";
import { asyncLongRead } from "./async";
import { reviewLongRead } from "./review";
import { cacheLongRead } from "./cache";

/** Original, AI-assisted practice texts. Not republished news or live generation. */
export const longReads = [
  reactLongRead,
  asyncLongRead,
  reviewLongRead,
  cacheLongRead,
];
export const longReadDemos = longReads.map((article) => ({
  key: article.key,
  title: article.title,
  mode: "tech",
  language: "en",
  origin: "demo-authored-long",
  source: article.blocks.map(([original]) => original).join("\n\n"),
  learning: article.blocks.map(([, learning]) => learning),
  terms: article.terms,
}));
