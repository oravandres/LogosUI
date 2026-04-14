/**
 * Returns a normalised absolute URL suitable for a live `href` only when the
 * scheme is `http:` or `https:`. Other values (e.g. `javascript:`, `data:`,
 * relative paths) return `null` so callers can render plain text instead.
 */
export function safeHttpHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.href;
}
