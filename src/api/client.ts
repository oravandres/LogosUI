const DEV_DEFAULT_BASE = "http://localhost:8000";

/**
 * Base URL for the Logos HTTP API (no trailing slash).
 * In development, defaults to Logos' default bind (`API_PORT=8000`) if unset.
 * In production builds, `VITE_LOGOS_API_BASE_URL` is required.
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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
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

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(buildUrl(path), { ...init, headers });
  const text = await res.text();
  let data: unknown;
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError("Response is not valid JSON", res.status, text);
    }
  } else {
    data = undefined;
  }

  if (!res.ok) {
    throw new ApiError(
      errorMessageFromBody(data, res.statusText),
      res.status,
      data
    );
  }

  return data as T;
}
