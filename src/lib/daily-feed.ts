import {
  DAILY_FEED,
  MAX_EDITION_BYTES,
  dailyIndexSchema,
  dayFromDailyId,
  type DailyEdition,
  type DailyIndex,
} from "./daily-publication";
import {
  getPublishedSample,
  latestDailyEdition,
  registerDailyEdition,
} from "./published-catalog";

const INDEX_KEY = "wordweave.daily-index.v1";
let database: Promise<IDBDatabase> | undefined;
function openCache() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("wordweave-public-editions", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("editions");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(new Error("Could not open the daily article cache."));
    };
  }));
}
async function cachedEdition(day: string) {
  try {
    const db = await openCache();
    return await new Promise<DailyEdition | null>((resolve, reject) => {
      const request = db
        .transaction("editions")
        .objectStore("editions")
        .get(day);
      request.onsuccess = () => {
        try {
          if (request.result && request.result.date !== day)
            throw new Error("Cached daily edition date mismatch.");
          resolve(request.result ? registerDailyEdition(request.result) : null);
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}
async function cacheEdition(edition: DailyEdition) {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("editions", "readwrite");
      tx.objectStore("editions").put(edition, edition.date);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* Reading still works if the public download cannot be cached. */
  }
}
async function fetchText(url: string, maximum: number) {
  const response = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-cache",
    signal: AbortSignal.timeout(7000),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? 0) > maximum
  )
    throw new Error("Daily feed is unavailable.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Daily feed is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Daily feed is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function readIndex(): DailyIndex | null {
  try {
    return dailyIndexSchema.parse(
      JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null"),
    );
  } catch {
    return null;
  }
}
async function freshIndex() {
  const index = dailyIndexSchema.parse(
    JSON.parse(await fetchText(`${DAILY_FEED}/index.json`, 512000)),
  );
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* Optional cache. */
  }
  return index;
}
async function downloadEdition(entry: DailyIndex["editions"][number]) {
  const cached = await cachedEdition(entry.date);
  if (cached) return cached;
  const text = await fetchText(
    `${DAILY_FEED}/editions/${entry.date}.json`,
    MAX_EDITION_BYTES,
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== entry.sha256)
    throw new Error("Daily edition integrity check failed.");
  const value = JSON.parse(text);
  if (value?.date !== entry.date)
    throw new Error("Daily edition date mismatch.");
  const edition = registerDailyEdition(value);
  await cacheEdition(edition);
  return edition;
}
export async function loadDailyEdition(
  day: string,
): Promise<DailyEdition | null> {
  const available = latestDailyEdition(day);
  if (available?.date === day) return available;
  const cachedIndex = readIndex();
  const exact = cachedIndex?.editions.find((entry) => entry.date === day);
  if (exact) {
    try {
      return await downloadEdition(exact);
    } catch {
      /* Try the fresh index. */
    }
  }
  let index = cachedIndex;
  try {
    index = await freshIndex();
  } catch {
    /* Fall back only to an already processed edition. */
  }
  const entry = index?.editions
    .filter((item) => item.date <= day)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (entry) {
    try {
      return await downloadEdition(entry);
    } catch {
      /* Keep the built-in processed edition. */
    }
  }
  return latestDailyEdition(day);
}
export async function loadPublishedSample(id: string) {
  const builtIn = getPublishedSample(id);
  if (builtIn) return builtIn;
  const date = dayFromDailyId(id);
  if (!date)
    throw new Error("这不是每日文章链接。 / Invalid daily article link.");
  if (await cachedEdition(date)) return getPublishedSample(id);
  let index = readIndex();
  if (!index?.editions.some((entry) => entry.date === date))
    index = await freshIndex();
  const entry = index.editions.find((entry) => entry.date === date);
  if (!entry)
    throw new Error(
      "这期文章暂时无法读取，请稍后重试。 / This edition is temporarily unavailable.",
    );
  await downloadEdition(entry);
  return getPublishedSample(id);
}
