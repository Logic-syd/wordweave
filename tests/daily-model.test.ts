import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { DailyModel } from "../scripts/daily-model";

let directory: string;
const key = "fixture-private-daily-key-never-published";
const schema = z.object({ text: z.string() });
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "wordweave-daily-test-"));
  vi.stubEnv("DAILY_DEEPSEEK_API_KEY", key);
  vi.stubEnv("DAILY_DEEPSEEK_MODEL", "fixture-model");
  vi.stubEnv("DAILY_DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(directory, { recursive: true, force: true });
});
function success(content = '{"text":"public article"}') {
  return Response.json({
    id: "fixture-completion",
    model: "fixture-model",
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 15, completion_tokens: 9 },
  });
}
describe("private daily publisher", () => {
  it("resumes a successful checkpoint without billing twice or saving the key", async () => {
    const fetcher = vi.fn(async () => success());
    vi.stubGlobal("fetch", fetcher);
    let model = new DailyModel(directory);
    const action = () => model.request("1.source", schema, "JSON", {});
    expect(await model.checkpoint("source", schema, action)).toEqual({
      text: "public article",
    });
    model = new DailyModel(directory);
    expect(await model.checkpoint("source", schema, action)).toEqual({
      text: "public article",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(model.receipt("1.source").completionIds).toEqual([
      "fixture-completion",
    ]);
    expect(readFileSync(join(directory, "journal.json"), "utf8")).not.toContain(
      key,
    );
    const init = (
      fetcher.mock.calls as unknown as [string, RequestInit][]
    )[0][1];
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${key}` });
  });
  it("counts a failed request, sanitizes provider errors and keeps the last checkpoint", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: { message: key } }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const model = new DailyModel(directory);
    await model.checkpoint("previous", schema, async () => ({
      text: "last success",
    }));
    await expect(
      model.request("1.source", schema, "JSON", {}),
    ).rejects.toMatchObject({ kind: "authentication", retryable: false });
    const reloaded = new DailyModel(directory);
    expect(reloaded.statistics().requests).toBe(1);
    expect(
      await reloaded.checkpoint("previous", schema, async () => {
        throw new Error("must not run");
      }),
    ).toEqual({ text: "last success" });
    expect(readFileSync(join(directory, "journal.json"), "utf8")).not.toContain(
      key,
    );
  });
  it("never checkpoints malformed JSON and refuses a response echoing credentials", async () => {
    const fetcher = vi.fn(async () => success('{"text":'));
    vi.stubGlobal("fetch", fetcher);
    const model = new DailyModel(directory);
    await expect(
      model.checkpoint("bad", schema, () =>
        model.request("1.low", schema, "JSON", {}),
      ),
    ).rejects.toThrow();
    expect(
      JSON.parse(readFileSync(join(directory, "journal.json"), "utf8"))
        .checkpoints,
    ).not.toHaveProperty("bad");
    fetcher.mockImplementation(async () =>
      success(JSON.stringify({ text: key })),
    );
    await expect(model.request("1.low", schema, "JSON", {})).rejects.toThrow(
      "Credential found",
    );
    expect(readFileSync(join(directory, "journal.json"), "utf8")).not.toContain(
      key,
    );
  });
  it("enforces persisted request and input budgets before sending another request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    writeFileSync(
      join(directory, "journal.json"),
      JSON.stringify({
        version: 1,
        attempts: 50,
        inputCharacters: 100,
        calls: [],
        checkpoints: {},
      }),
    );
    await expect(
      new DailyModel(directory).request("next", schema, "JSON", {}),
    ).rejects.toThrow("budget");
    writeFileSync(
      join(directory, "journal.json"),
      JSON.stringify({
        version: 1,
        attempts: 0,
        inputCharacters: 1199999,
        calls: [],
        checkpoints: {},
      }),
    );
    await expect(
      new DailyModel(directory).request("next", schema, "JSON", {}),
    ).rejects.toThrow("budget");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects arbitrary API destinations before sending the owner's key", () => {
    for (const url of [
      "https://example.com/v1",
      "http://api.deepseek.com/v1",
      "https://api.deepseek.com/v1?key=bad",
      "https://user@api.deepseek.com/v1",
    ]) {
      vi.stubEnv("DAILY_DEEPSEEK_BASE_URL", url);
      expect(() => new DailyModel(directory)).toThrow("official DeepSeek");
    }
  });
});
