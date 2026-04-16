import { fetchJson, postJson, putJson } from "@/api/client";
import type { Author, AuthorWriteBody, PaginatedResponse } from "@/api/types";

const API_PREFIX = "/api/v1/authors";

/** Matches Logos `model.DefaultLimit`. */
export const AUTHORS_PAGE_SIZE = 20;

export type ListAuthorsParams = {
  limit?: number;
  offset?: number;
  categoryId?: string;
  /** Substring match on name (server uses ILIKE). */
  name?: string;
  signal?: AbortSignal;
};

export function listAuthors(
  params: ListAuthorsParams = {}
): Promise<PaginatedResponse<Author>> {
  const limit = params.limit ?? AUTHORS_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  search.set("offset", String(offset));
  if (params.categoryId && params.categoryId.trim() !== "") {
    search.set("category_id", params.categoryId.trim());
  }
  const name = params.name?.trim() ?? "";
  if (name !== "") {
    search.set("name", name);
  }
  const q = search.toString();
  return fetchJson<PaginatedResponse<Author>>(`${API_PREFIX}?${q}`, {
    signal: params.signal,
  });
}

export function createAuthor(body: AuthorWriteBody): Promise<Author> {
  return postJson<Author>(API_PREFIX, body);
}

export function getAuthor(
  id: string,
  signal?: AbortSignal
): Promise<Author> {
  return fetchJson<Author>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    signal,
  });
}

export function updateAuthor(
  id: string,
  body: AuthorWriteBody
): Promise<Author> {
  return putJson<Author>(`${API_PREFIX}/${encodeURIComponent(id)}`, body);
}

export function deleteAuthor(id: string): Promise<void> {
  return fetchJson<void>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
