import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { createAppQueryClient } from "@/api/queryClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAppQueryClient", () => {
  it("logs query failures via the global QueryCache hook", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createAppQueryClient();

    await client
      .fetchQuery({
        queryKey: ["categories", "list"],
        queryFn: () => {
          throw new ApiError("boom", 500, null, {
            path: "/api/v1/categories",
            method: "GET",
            requestId: "req-q-1",
          });
        },
        retry: false,
      })
      .catch(() => {});

    expect(spy).toHaveBeenCalledWith("[ui] api error", {
      source: "query",
      key: ["categories", "list"],
      name: "ApiError",
      message: "boom",
      status: 500,
      method: "GET",
      path: "/api/v1/categories",
      requestId: "req-q-1",
    });
    client.clear();
  });

  it("logs mutation failures via the global MutationCache hook with the mutationKey", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createAppQueryClient();

    const result = client
      .getMutationCache()
      .build(client, {
        mutationKey: ["create-category"],
        mutationFn: async () => {
          throw new ApiError("validation failed", 422, null, {
            path: "/api/v1/categories",
            method: "POST",
            requestId: "req-m-9",
          });
        },
        retry: false,
      })
      .execute(undefined);

    await result.catch(() => {});

    expect(spy).toHaveBeenCalledWith("[ui] api error", {
      source: "mutation",
      key: ["create-category"],
      name: "ApiError",
      message: "validation failed",
      status: 422,
      method: "POST",
      path: "/api/v1/categories",
      requestId: "req-m-9",
    });
    client.clear();
  });

  it("does not log aborted queries (e.g. filter changes superseding an in-flight list)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createAppQueryClient();

    await client
      .fetchQuery({
        queryKey: ["categories", "list"],
        queryFn: () => {
          throw new DOMException("aborted", "AbortError");
        },
        retry: false,
      })
      .catch(() => {});

    expect(spy).not.toHaveBeenCalled();
    client.clear();
  });
});
