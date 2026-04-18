import { ApiError } from "@/api/client";

/**
 * Source of a logged failure. Keeps the log filterable by surface:
 * - `query` — TanStack Query `QueryCache.onError` (read paths).
 * - `mutation` — TanStack Query `MutationCache.onError` (write paths).
 * - `direct` — manual call from a non-query call site (rare).
 */
export type ApiErrorSource = "query" | "mutation" | "direct";

export interface LogContext {
  source: ApiErrorSource;
  /** TanStack Query `queryKey` or `mutationKey`, when available. */
  key?: ReadonlyArray<unknown>;
}

/**
 * True for errors that represent an intentional cancellation (route change,
 * stale list refetch, debounce supersede). These are not failures and must
 * not be logged as one — otherwise navigating the UI would generate a
 * constant stream of misleading "errors" in observability.
 */
export function isAbortLike(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "CanceledError") return true;
  }
  return false;
}

/**
 * Stable structured event for an error caught at the React Query cache
 * boundary. Field set is intentionally narrow — `name`, `status`, `method`,
 * `path`, `requestId`, `message`, `source`, optionally `key` — and never
 * includes the response body or request payload, so we cannot accidentally
 * leak user-entered text or other PII into client logs.
 *
 * Aborted requests (`isAbortLike`) are skipped silently. The event is
 * emitted to `console.error` for now; future RUM wiring can replace the
 * sink without touching call sites.
 */
export function logApiError(err: unknown, ctx: LogContext): void {
  if (isAbortLike(err)) return;

  if (err instanceof ApiError) {
    console.error("[ui] api error", {
      source: ctx.source,
      key: ctx.key,
      name: err.name,
      message: err.message,
      status: err.status,
      method: err.method,
      path: err.path,
      requestId: err.requestId,
    });
    return;
  }

  if (err instanceof Error) {
    console.error("[ui] api error", {
      source: ctx.source,
      key: ctx.key,
      name: err.name,
      message: err.message,
    });
    return;
  }

  console.error("[ui] api error", {
    source: ctx.source,
    key: ctx.key,
    name: "UnknownError",
    message: String(err),
  });
}
