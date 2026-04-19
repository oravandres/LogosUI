import { CancelledError } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/api/client";
import { isAbortLike, logApiError } from "@/api/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isAbortLike", () => {
  it("identifies fetch DOMException AbortError", () => {
    expect(isAbortLike(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("identifies plain Error with name AbortError or CanceledError", () => {
    const a = new Error("nope");
    a.name = "AbortError";
    const c = new Error("nope");
    c.name = "CanceledError";
    expect(isAbortLike(a)).toBe(true);
    expect(isAbortLike(c)).toBe(true);
  });

  it("identifies TanStack Query's CancelledError so route changes do not log noise", () => {
    // TanStack Query v5 cancels superseded queries by throwing this class
    // (note the spelling — double `l`). Without explicit handling, our
    // QueryCache.onError hook would log every filter change as an error.
    expect(isAbortLike(new CancelledError())).toBe(true);
  });

  it("ignores ordinary errors and non-error values", () => {
    expect(isAbortLike(new Error("boom"))).toBe(false);
    expect(isAbortLike("nope")).toBe(false);
    expect(isAbortLike(null)).toBe(false);
    expect(isAbortLike(undefined)).toBe(false);
  });
});

describe("logApiError", () => {
  it("emits a structured event for ApiError with status, method, path, requestId", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new ApiError("Quote is locked", 409, { error: "Quote is locked" }, {
      path: "/api/v1/quotes/abc",
      method: "PUT",
      requestId: "req-123",
    });

    logApiError(err, { source: "mutation", key: ["update-quote"] });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[ui] api error", {
      source: "mutation",
      key: ["update-quote"],
      name: "ApiError",
      message: "Quote is locked",
      status: 409,
      method: "PUT",
      path: "/api/v1/quotes/abc",
      requestId: "req-123",
    });
  });

  it("falls back to a minimal event for non-ApiError Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new TypeError("Failed to fetch");

    logApiError(err, { source: "query", key: ["health"] });

    expect(spy).toHaveBeenCalledWith("[ui] api error", {
      source: "query",
      key: ["health"],
      name: "TypeError",
      message: "Failed to fetch",
    });
  });

  it("emits a structured event for NetworkError carrying path and method (no status / requestId)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new TypeError("Failed to fetch");
    const err = new NetworkError(
      "Failed to fetch",
      { path: "/api/v1/quotes", method: "GET" },
      { cause }
    );

    logApiError(err, { source: "query", key: ["quotes", "list"] });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[ui] api error", {
      source: "query",
      key: ["quotes", "list"],
      name: "NetworkError",
      message: "Failed to fetch",
      method: "GET",
      path: "/api/v1/quotes",
    });
    // `cause` and any underlying transport details must not leak into the
    // structured payload.
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect("cause" in payload).toBe(false);
    expect("status" in payload).toBe(false);
    expect("requestId" in payload).toBe(false);
  });

  it("handles unknown thrown values without crashing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logApiError("just a string", { source: "direct" });
    expect(spy).toHaveBeenCalledWith("[ui] api error", {
      source: "direct",
      key: undefined,
      name: "UnknownError",
      message: "just a string",
    });
  });

  it("never logs the response body, even when present on the ApiError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new ApiError("validation failed", 422, {
      error: "validation failed",
      details: "name: must be at most 200 chars; secret: hunter2",
    });

    logApiError(err, { source: "mutation" });

    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect("body" in payload).toBe(false);
    // Defense in depth: the entire serialised payload must not contain the
    // secret string we slipped into the response body above.
    expect(JSON.stringify(payload)).not.toContain("hunter2");
  });

  it("silently skips abort errors so navigation does not produce noise", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logApiError(new DOMException("aborted", "AbortError"), {
      source: "query",
      key: ["quotes"],
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("silently skips TanStack Query CancelledError surfaced through QueryCache.onError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logApiError(new CancelledError(), { source: "query", key: ["quotes"] });
    expect(spy).not.toHaveBeenCalled();
  });
});
