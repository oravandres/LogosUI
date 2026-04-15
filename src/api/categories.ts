import { fetchJson, postJson, putJson } from "@/api/client";
import type {
  Category,
  CategoryWriteBody,
  PaginatedResponse,
} from "@/api/types";

const API_PREFIX = "/api/v1/categories";

/** Matches Logos `model.DefaultLimit` (see `internal/model/pagination.go`). */
export const CATEGORIES_PAGE_SIZE = 20;

/** Matches Logos `MaxLimit` for paged fetches. */
export const CATEGORY_LIST_MAX_LIMIT = 100;

export type CategoryTypeFilter = "" | "image" | "quote" | "author";

export type ListCategoriesParams = {
  limit?: number;
  offset?: number;
  /** When empty, no `type` query param is sent (all types). */
  type?: CategoryTypeFilter;
  /** Pass from React Query `queryFn` context to cancel superseded requests. */
  signal?: AbortSignal;
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
  return fetchJson<PaginatedResponse<Category>>(`${API_PREFIX}?${q}`, {
    signal: params.signal,
  });
}

/**
 * Fetches every category of a fixed type by paging until the server returns a
 * short page or the reported total is reached.
 */
export async function listAllCategoriesByType(
  type: Exclude<CategoryTypeFilter, "">,
  signal?: AbortSignal
): Promise<Category[]> {
  const out: Category[] = [];
  let offset = 0;
  for (;;) {
    const page = await listCategories({
      type,
      limit: CATEGORY_LIST_MAX_LIMIT,
      offset,
      signal,
    });
    out.push(...page.items);
    if (
      page.items.length === 0 ||
      page.items.length < CATEGORY_LIST_MAX_LIMIT ||
      out.length >= page.total
    ) {
      break;
    }
    offset += CATEGORY_LIST_MAX_LIMIT;
  }
  return out;
}

export function createCategory(
  body: CategoryWriteBody
): Promise<Category> {
  return postJson<Category>(API_PREFIX, body);
}

export function getCategory(
  id: string,
  signal?: AbortSignal
): Promise<Category> {
  return fetchJson<Category>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    signal,
  });
}

export function updateCategory(
  id: string,
  body: CategoryWriteBody
): Promise<Category> {
  return putJson<Category>(`${API_PREFIX}/${encodeURIComponent(id)}`, body);
}

export function deleteCategory(id: string): Promise<void> {
  return fetchJson<void>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
