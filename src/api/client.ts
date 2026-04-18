const DEV_DEFAULT_BASE = "http://localhost:8000";

/**
 * Base URL for the Logos HTTP API (no trailing slash).
 * In development, defaults to Logos' default bind (`API_PORT=8000`) if unset.
 * In production builds, `VITE_LOGOS_API_BASE_URL` is required (also enforced in `vite.config.ts` at build time).
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_LOGOS_API_BASE_URL;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return DEV_DEFAULT_BASE;
  }
  throw new Error(
    "Missing VITE_LOGOS_API_BASE_URL. Set it when building for production."
  );
}

/**
 * Optional metadata attached to an `ApiError` for observability. Populated by
 * `fetchJson` so the global query / mutation error logger can emit a
 * structured event (`status`, `method`, `path`, `requestId`) without each
 * call site having to thread the request shape through itself.
 *
 * `requestId` is the value of the response's `X-Request-Id` header when the
 * backend emits one; it is `undefined` when the header is absent. (The UI
 * does not yet generate a client-side request id — that is deferred until
 * Logos starts emitting one server-side per Plan §D.)
 */
export interface ApiErrorMeta {
  path?: string;
  method?: string;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly path?: string;
  readonly method?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    body: unknown,
    meta: ApiErrorMeta = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.path = meta.path;
    this.method = meta.method;
    this.requestId = meta.requestId;
  }
}

function buildUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Parses Logos JSON error bodies: `{ "error": string, "details"?: string }`. */
function errorMessageFromBody(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return fallback;
}

function readRequestId(headers: Headers): string | undefined {
  // Header names are case-insensitive per RFC 7230; `Headers.get` already
  // normalises. Treat empty strings as absent so a misbehaving proxy that
  // strips the value to "" does not poison the log payload.
  const raw = headers.get("x-request-id");
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();

  const res = await fetch(buildUrl(path), { ...init, headers });
  const requestId = readRequestId(res.headers);
  const text = await res.text();
  let data: unknown;
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError("Response is not valid JSON", res.status, text, {
        path,
        method,
        requestId,
      });
    }
  } else {
    data = undefined;
  }

  if (!res.ok) {
    throw new ApiError(
      errorMessageFromBody(data, res.statusText),
      res.status,
      data,
      { path, method, requestId }
    );
  }

  return data as T;
}

/** POST with a JSON-serialized body and `Content-Type: application/json`. */
export async function postJson<TResponse>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, "body" | "method">
): Promise<TResponse> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return fetchJson<TResponse>(path, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** PUT with a JSON-serialized body and `Content-Type: application/json`. */
export async function putJson<TResponse>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, "body" | "method">
): Promise<TResponse> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return fetchJson<TResponse>(path, {
    ...init,
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
}
