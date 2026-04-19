import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, fetchJson, postJson } from "@/api/client";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    );
    const data = await fetchJson<{ ok: boolean }>("/api/v1/health");
    expect(data).toEqual({ ok: true });
  });

  it("throws ApiError carrying path, method, and requestId from response headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          409,
          { error: "Category is in use" },
          { "X-Request-Id": "req-abc-123" }
        )
      )
    );

    await expect(
      fetchJson("/api/v1/categories/cat-1", { method: "DELETE" })
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "Category is in use",
      status: 409,
      path: "/api/v1/categories/cat-1",
      method: "DELETE",
      requestId: "req-abc-123",
    });
  });

  it("defaults method to GET when init.method is omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(500, { error: "boom" }))
    );

    const promise = fetchJson("/api/v1/health");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ method: "GET" });
  });

  it("treats absent or empty X-Request-Id as undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(500, { error: "boom" }, { "X-Request-Id": "  " })
        )
    );
    await expect(fetchJson("/api/v1/health")).rejects.toMatchObject({
      requestId: undefined,
    });
  });

  it("throws ApiError with raw text body when the response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>nginx 502</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        })
      )
    );
    await expect(fetchJson("/api/v1/health")).rejects.toMatchObject({
      message: "Response is not valid JSON",
      status: 502,
      body: "<html>nginx 502</html>",
      method: "GET",
      path: "/api/v1/health",
    });
  });

  it("wraps a rejected fetch promise in NetworkError carrying path and method", async () => {
    // Simulates the real shape thrown by `window.fetch` for offline / DNS /
    // TLS / CORS-rejected requests: a `TypeError("Failed to fetch")`.
    const cause = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));

    const promise = fetchJson("/api/v1/quotes", { method: "GET" });
    await expect(promise).rejects.toBeInstanceOf(NetworkError);
    await expect(promise).rejects.toMatchObject({
      name: "NetworkError",
      message: "Failed to fetch",
      path: "/api/v1/quotes",
      method: "GET",
    });
    // `cause` is preserved for developer inspection but not surfaced by the
    // structured logger (covered in `logger.test.ts`).
    await expect(promise).rejects.toHaveProperty("cause", cause);
  });

  it("re-throws AbortError from a rejected fetch promise so cancellation semantics are preserved", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(
      fetchJson("/api/v1/quotes", { method: "GET" })
    ).rejects.toBe(abort);
  });

  it("postJson sends method POST and JSON content-type, and surfaces them on errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(422, { error: "name is required" }, { "X-Request-Id": "r-7" })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postJson("/api/v1/categories", { name: "" })
    ).rejects.toMatchObject({
      method: "POST",
      path: "/api/v1/categories",
      status: 422,
      requestId: "r-7",
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json"
    );
  });
});
