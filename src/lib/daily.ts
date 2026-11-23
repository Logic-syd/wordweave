import { practiceSamples } from "./practice-content";

/** Editorial content, bundled with the site. No model call or scraped article. */
export const speakingPicks = [
  {
    id: "daily-speak-coffee-v1",
    title: "A small pause in the day",
    text: "I stopped by a small coffee shop on my way home. The barista asked how my day was going, and we ended up chatting about the neighbourhood.\nI had been staring at a screen all afternoon, so it felt good to slow down for a moment. I ordered a flat white and found a seat by the window.\nSometimes a short conversation is all it takes to make an ordinary day feel a little different.",
  },
  {
    id: "daily-speak-library-v1",
    title: "A book I did not plan to borrow",
    text: "I went to the library to return a book and leave straight away. Near the entrance, someone had arranged a small display of books about city gardens.\nI picked one up while I waited for the rain to stop. Twenty minutes later, I was still reading about growing tomatoes on a balcony.\nI left with a new book and a very small plan for the weekend.",
  },
  {
    id: "daily-speak-bus-v1",
    title: "The stop after mine",
    text: "I was so busy listening to a podcast that I missed my bus stop. My first thought was that I had wasted ten minutes of my evening.\nThen I noticed a path along the river that I had never used before. I put my phone away and walked home by the water.\nThe journey took longer, but I arrived feeling less tired than usual.",
  },
  {
    id: "daily-speak-meeting-v1",
    title: "One useful question",
    text: "Our meeting was nearly over when a colleague asked what would happen if the connection failed. Nobody had included that case in the design.\nWe drew a simple error screen together and agreed on a clear message for the user. It took another ten minutes, but it saved us a much longer discussion later.\nSometimes the most useful contribution is a question that sounds obvious.",
  },
  {
    id: "daily-speak-market-v1",
    title: "Enough for two dinners",
    text: "At the market, I asked the seller how much food I needed for two dinners. She suggested a smaller bag of potatoes and a few vegetables that would keep well.\nI had expected her to sell me more, so her advice surprised me. That evening, I made soup and put half of it in the fridge.\nThe next day, having dinner already prepared felt like a present from my past self.",
  },
  {
    id: "daily-speak-film-v1",
    title: "Talking after the film",
    text: "My friend and I left the cinema with completely different opinions. I liked the ending because it left room for questions, while she wanted a clearer answer.\nWe talked about one scene all the way to the station. By the time our train arrived, I understood why that scene had bothered her.\nWe still disagreed about the film, but the conversation made me want to watch it again.",
  },
  {
    id: "daily-speak-bike-v1",
    title: "Learning to fix a small problem",
    text: "My bike made a strange sound every time I turned the pedals. I took it to a repair shop and expected to leave it there for the afternoon.\nThe mechanic showed me a loose part and explained how to tighten it. I tried it myself while he watched.\nI rode home with a quieter bike and a little more confidence about fixing things.",
  },
] as const;

// Keep IDs stable when editing the catalog so saved links continue to work.
const readingByLanguage = {
  en: [
    "sample-react-state-v1",
    "sample-async-search-v1",
    "sample-code-review-v1",
    "sample-http-cache-v1",
  ],
  de: [
    "sample-supermarket-v1",
    "sample-commute-v1",
    "sample-cafe-v1",
    "sample-apartment-v1",
  ],
} as const;
export const readingPicks = [...readingByLanguage.en, ...readingByLanguage.de];
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dayNumber(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("Invalid calendar date");
  const time = Date.parse(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== day
  )
    throw new Error("Invalid calendar date");
  return Math.round((time - Date.UTC(2026, 10, 20)) / 86400000);
}
function pick<T>(values: readonly T[], day: string) {
  const n = dayNumber(day);
  return values[((n % values.length) + values.length) % values.length];
}
export function dailyReading(day = localDay(), language: "en" | "de" = "en") {
  return pick(readingByLanguage[language], day);
}
export function dailyLesson(day = localDay()) {
  const listening = pick(practiceSamples, day);
  return {
    day,
    reading: dailyReading(day),
    speaking: pick(speakingPicks, day),
    listening,
    paragraph: listening.paragraphs[0].id,
  };
}
