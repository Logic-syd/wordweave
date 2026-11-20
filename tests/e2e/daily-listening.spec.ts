import { test, expect } from "./fixtures";

test("daily picks rotate, save only by choice and reopen independently", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("chat/completions")) requests.push(r.url());
  });
  const first: Record<string, string> = {};
  for (const skill of ["read", "listen", "speak"]) {
    await page.goto(`/${skill}`);
    const banner = page.getByRole("region", { name: "每日精选" });
    await expect(banner).toHaveAttribute("data-day", "2026-11-20");
    first[skill] = (await banner.getAttribute("data-content-id"))!;
    await page.reload();
    await expect(banner).toHaveAttribute("data-content-id", first[skill]);
  }
  await page.goto("/library");
  await expect(page.locator(".saved-lesson-card")).toHaveCount(0);
  for (const skill of ["read", "listen", "speak"]) {
    await page.goto(`/${skill}`);
    const save = page
      .getByRole("region", { name: "每日精选" })
      .getByRole("button", { name: /保存到我的库/ });
    await save.click();
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "每日精选" })
        .getByRole("button", { name: /已保存到我的库/ }),
    ).toBeDisabled();
  }
  await page.goto("/library");
  await expect(page.locator(".saved-lesson-card")).toHaveCount(3);
  await page.clock.setFixedTime(new Date("2026-11-21T12:00:00Z"));
  for (const skill of ["read", "listen", "speak"]) {
    await page.goto(`/${skill}`);
    const banner = page.getByRole("region", { name: "每日精选" });
    await expect(banner).toHaveAttribute("data-day", "2026-11-21");
    await expect(banner).not.toHaveAttribute("data-content-id", first[skill]);
  }
  await page.goto("/library");
  await expect(page.locator(".saved-lesson-card")).toHaveCount(3);
  const oldSpeaking = page
    .locator(".saved-lesson-card")
    .filter({ hasText: "A small pause in the day" });
  await oldSpeaking.getByRole("link", { name: /继续学习/ }).click();
  await expect(page.locator("#practiceTitle")).toHaveText(
    "A small pause in the day",
  );
  await page.goto("/library");
  await page
    .getByRole("button", { name: "移出我的库：A small pause in the day" })
    .click();
  await expect(page.locator(".saved-lesson-card")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".saved-lesson-card")).toHaveCount(2);
  expect(requests).toEqual([]);
});

function wav() {
  const rate = 8000,
    samples = rate * 12;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  return bytes;
}

test("audio dictation compares the entire supplied transcript and keeps earlier imports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/listen");
  const inbox = page.getByRole("region", { name: "导入听力材料", exact: true });
  const transcript =
    "We missed the bus.\n\nThe next one arrives in ten minutes.";
  await inbox.getByLabel(/上传音频/).setInputFiles({
    name: "Bus recording.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await inbox.getByLabel(/^原文/).fill(transcript);
  await inbox.getByRole("button", { name: /保存并开始练习/ }).click();
  await expect(page.locator(".practice-material-heading h2")).toHaveText(
    "Bus recording",
  );
  await expect(page.locator(".transcript-text")).toHaveCount(0);
  await page.getByText(/^换个练法/).click();
  await page
    .getByRole("button", { name: "听写对照 / Dictation", exact: true })
    .click();
  await page
    .locator(".practice-workspace textarea")
    .fill("We missed the bus. The next one arrives in ten minutes.");
  await page
    .locator(".practice-workspace form")
    .filter({ has: page.locator("textarea") })
    .getByRole("button", { name: /保存并对照听写/ })
    .click();
  await expect(page.locator(".transcript-text")).toContainText(
    "The next one arrives in ten minutes.",
  );
  await expect(page.locator(".dictation-result").first()).toContainText("100");
  await page.reload();
  await expect(page.locator(".practice-workspace textarea")).toHaveValue(
    "We missed the bus. The next one arrives in ten minutes.",
  );
  await inbox.getByLabel(/上传音频/).setInputFiles({
    name: "Second recording.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await inbox.getByRole("button", { name: /保存并开始练习/ }).click();
  await expect(page.locator(".practice-material-heading h2")).toHaveText(
    "Second recording",
  );
  await expect(page.locator(".listening-saved > button")).toHaveCount(2);
  await page.goto("/library");
  await expect(page.locator(".saved-lesson-card")).toHaveCount(2);
});

test("local audio import, playback controls, answer without a transcript and reload work without an API", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const uploads: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") uploads.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/listen");
  const inbox = page.getByRole("region", { name: "导入听力材料", exact: true });
  const audioInput = inbox.getByLabel(/上传音频/);
  await audioInput.setInputFiles({
    name: "not-audio.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(inbox.getByRole("alert")).toBeVisible();
  await audioInput.setInputFiles({
    name: "My listening.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await inbox.getByRole("button", { name: /保存并开始练习/ }).click();
  const audio = page.getByLabel("本地音频播放器");
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState))
    .toBeGreaterThanOrEqual(1);
  await audio.evaluate((a: HTMLAudioElement) => {
    a.currentTime = 8;
  });
  await page.getByRole("button", { name: /回退 5 秒/ }).click();
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeCloseTo(3, 0);
  await page.locator(".local-audio-controls select").selectOption("0.65");
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.playbackRate))
    .toBe(0.65);
  await audio.evaluate(async (a: HTMLAudioElement) => {
    await a.play();
  });
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused))
    .toBe(false);
  await audio.evaluate((a: HTMLAudioElement) => a.pause());
  await page.getByLabel(/我听到的重点/).fill("My notes from the recording.");
  await page.getByRole("button", { name: /保存我的答案/ }).click();
  await expect(
    page.getByRole("region", { name: "本次练习反馈" }),
  ).toContainText("本次没有自动评分");
  await expect(page.locator(".dictation-result")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /保存并获取 AI 反馈/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /已保存到我的库/ }),
  ).toBeDisabled();
  await page.reload();
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState))
    .toBeGreaterThanOrEqual(1);
  await expect(page.getByLabel(/我听到的重点/)).toHaveValue(
    "My notes from the recording.",
  );
  await page.screenshot({
    path: "test-results/listening-audio-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/listen");
  await expect(page.locator(".listening-inbox .inbox-body")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /播放这一段/ }),
  ).toBeInViewport();
  const playBox = await page.locator(".play-main").boundingBox();
  const speedBox = await page.locator(".play-speed").boundingBox();
  expect(playBox!.y + playBox!.height).toBeLessThanOrEqual(speedBox!.y);
  await page.getByRole("button", { name: /导入与我的库/ }).click();
  await expect(audioInput).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/listening-inbox-mobile.png",
    fullPage: true,
  });
  expect(uploads).toEqual([]);
  expect(errors).toEqual([]);
});
