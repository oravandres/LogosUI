import { fetchJson } from "@/api/client";
import type { HealthOk } from "@/api/types";

/** GET /api/v1/health — 200 with `{ status: "healthy" }` or non-OK / unhealthy payload. */
export async function getHealth(signal?: AbortSignal): Promise<HealthOk> {
  return fetchJson<HealthOk>("/api/v1/health", { signal });
}
