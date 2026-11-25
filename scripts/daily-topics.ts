// Editorial topics and official references; never scrape or republish articles.
export const dailyTopics = [
  [
    "Debugging an intermittent bug without guessing",
    "https://developer.chrome.com/docs/devtools/javascript",
  ],
  [
    "Building an accessible asynchronous search interface",
    "https://www.w3.org/WAI/tutorials/forms/notifications/",
  ],
  [
    "Choosing a retry policy that does not duplicate a payment",
    "https://developer.mozilla.org/en-US/docs/Glossary/Idempotent",
  ],
  [
    "Explaining a technical trade-off in a design review",
    "https://google.github.io/eng-practices/review/reviewer/",
  ],
  [
    "A practical investigation of slow database queries",
    "https://www.postgresql.org/docs/current/using-explain.html",
  ],
  [
    "Making a deployment easier to reverse",
    "https://martinfowler.com/bliki/FeatureToggle.html",
  ],
  [
    "Finding a single source of truth for React state",
    "https://react.dev/learn/choosing-the-state-structure",
  ],
  [
    "Designing useful error messages for a file upload",
    "https://www.w3.org/WAI/tutorials/forms/validation/",
  ],
  [
    "Understanding the difference between caching and correctness",
    "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching",
  ],
  [
    "Writing a clear incident timeline without assigning blame",
    "https://sre.google/sre-book/postmortem-culture/",
  ],
  [
    "Testing a network-dependent feature with controlled responses",
    "https://playwright.dev/docs/network",
  ],
  [
    "Evolving an API without surprising its existing callers",
    "https://semver.org/",
  ],
  [
    "Keeping API credentials out of a public browser application",
    "https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety",
  ],
  [
    "Understanding keyboard focus when a dialog opens and closes",
    "https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/",
  ],
  [
    "Using small pull requests to make review more effective",
    "https://google.github.io/eng-practices/review/developer/small-cls.html",
  ],
  [
    "Investigating a layout shift in a real user interaction",
    "https://web.dev/articles/cls",
  ],
  [
    "Deciding where input validation belongs",
    "https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html",
  ],
  [
    "Understanding what a timeout can and cannot tell you",
    "https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static",
  ],
  [
    "Handling time zones in a daily learning application",
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat",
  ],
  [
    "Designing a useful loading state for a slow connection",
    "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html",
  ],
] as const;

export function topicsForDay(day: string) {
  const offset =
    Math.round(
      (Date.parse(`${day}T00:00:00Z`) - Date.UTC(2026, 10, 25)) / 86400000,
    ) * 2;
  const start =
    ((offset % dailyTopics.length) + dailyTopics.length) % dailyTopics.length;
  return [dailyTopics[start], dailyTopics[(start + 1) % dailyTopics.length]];
}
