import { fetchJson, postJson, putJson } from "@/api/client";
import type { PaginatedResponse, Quote, QuoteWriteBody } from "@/api/types";

const API_PREFIX = "/api/v1/quotes";

/** Matches Logos `model.DefaultLimit`. */
export const QUOTES_PAGE_SIZE = 20;

export type ListQuotesParams = {
  limit?: number;
  offset?: number;
  /** When empty, `author_id` is not sent. */
  authorId?: string;
  /** When empty, `category_id` is not sent. */
  categoryId?: string;
  /** Substring match on title (server uses ILIKE). */
  title?: string;
  signal?: AbortSignal;
};

export function listQuotes(
  params: ListQuotesParams = {}
): Promise<PaginatedResponse<Quote>> {
  const limit = params.limit ?? QUOTES_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  search.set("offset", String(offset));
  if (params.authorId && params.authorId.trim() !== "") {
    search.set("author_id", params.authorId.trim());
  }
  if (params.categoryId && params.categoryId.trim() !== "") {
    search.set("category_id", params.categoryId.trim());
  }
  const title = params.title?.trim() ?? "";
  if (title !== "") {
    search.set("title", title);
  }
  const q = search.toString();
  return fetchJson<PaginatedResponse<Quote>>(`${API_PREFIX}?${q}`, {
    signal: params.signal,
  });
}

export function getQuote(id: string, signal?: AbortSignal): Promise<Quote> {
  return fetchJson<Quote>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    signal,
  });
}

export function createQuote(body: QuoteWriteBody): Promise<Quote> {
  return postJson<Quote>(API_PREFIX, body);
}

export function updateQuote(
  id: string,
  body: QuoteWriteBody
): Promise<Quote> {
  return putJson<Quote>(`${API_PREFIX}/${encodeURIComponent(id)}`, body);
}

export function deleteQuote(id: string): Promise<void> {
  return fetchJson<void>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
