/**
 * Parse a non-negative integer from a URL search param. Returns `0` for
 * missing / non-integer / negative values so a tampered `?offset=-1`,
 * `?offset=foo`, `?offset=20foo`, `?offset=3.14`, or `?offset=1e2` cannot
 * put a paginated list into an invalid state.
 *
 * We deliberately do **not** rely on `Number.parseInt`'s lenient
 * "consume-leading-digits" behavior — a strict regex match on the whole
 * string is the only way to enforce the documented contract. See
 * `.cursor/rules/12-pr-review-lessons.mdc` (URL search params as state)
 * for the regression class this guards against.
 */
export function parseOffsetParam(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return n;
}
