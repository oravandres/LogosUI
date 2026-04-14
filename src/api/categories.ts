import { fetchJson, postJson } from "@/api/client";
import type {
  Category,
  CategoryWriteBody,
  PaginatedResponse,
} from "@/api/types";

const API_PREFIX = "/api/v1/categories";

/** Matches Logos `model.DefaultLimit` (see `internal/model/pagination.go`). */
export const CATEGORIES_PAGE_SIZE = 20;

export type CategoryTypeFilter = "" | "image" | "quote" | "author";

export type ListCategoriesParams = {
  limit?: number;
  offset?: number;
  /** When empty, no `type` query param is sent (all types). */
  type?: CategoryTypeFilter;
};

export function listCategories(
  params: ListCategoriesParams = {}
): Promise<PaginatedResponse<Category>> {
  const limit = params.limit ?? CATEGORIES_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  search.set("offset", String(offset));
  if (params.type) {
    search.set("type", params.type);
  }
  const q = search.toString();
  return fetchJson<PaginatedResponse<Category>>(`${API_PREFIX}?${q}`);
}

export function createCategory(
  body: CategoryWriteBody
): Promise<Category> {
  return postJson<Category>(API_PREFIX, body);
}

export function deleteCategory(id: string): Promise<void> {
  return fetchJson<void>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
