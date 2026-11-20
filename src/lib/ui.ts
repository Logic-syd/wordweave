import copy from "./ui-copy.json";

/** Authored interface copy only: never translate article text, code or API keys. */
export function ui(value: string): string {
  const key = value.trim().replace(/\s+/g, " ");
  const english = (copy as Record<string, string>)[key];
  if (!english || key === "我的 API / MY API") return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${value.trim()} / ${english}${trailing}`;
}
