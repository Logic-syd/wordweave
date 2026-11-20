import { test as base, expect } from "@playwright/test";
// Calendar-based recommendations must not make unrelated UI tests date-dependent.
export const test = base.extend({
  page: async ({ page }, runTest) => {
    await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
    await runTest(page);
  },
});
export { expect };
