// Match the original Chinese label and its appended English translation.
export function uiName(text) {
  return new RegExp(
    "^" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)",
  );
}
