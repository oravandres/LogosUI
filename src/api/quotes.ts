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
  /**
   * When empty, `tag_id` is not sent. Server filters by exact tag association
   * (hashed semi-join); applies on top of the other filters.
   */
  tagId?: string;
  /**
   * Full-text search query. Threaded verbatim into Logos's
   * `websearch_to_tsquery('english', q)` against the `quotes.search_vector`
   * generated column (Logos migration 000007, PR #15), so the user-facing
   * search-box syntax is accepted as-is:
   *
   * - bare words / AND — `virtue courage` matches rows containing both (stemming applies).
   * - quoted phrases    — `"know thyself"` matches the exact sequence.
   * - negation          — `-fortune` excludes rows that match the term.
   * - disjunction       — `wisdom or folly` matches either.
   *
   * Empty string / whitespace-only is treated as absent (same convention as
   * the other facets) so an empty search box collapses to the unfiltered
   * path instead of degenerating the server's `ts_rank_cd` ordering to
   * zero across the board. The handler is a pure pass-through — no parsing,
   * no validation — so whatever lands here goes straight to the DB's
   * permissive parser.
   *
   * Wire shape is single-send:
   *
   * - Canonical path (`legacyTitleOnly` false/undefined): sent as `?q=` only.
   *   The FTS-aware Logos handler composes `title` ILIKE with the tsvector
   *   filter as AND (Logos PR #15, `QuoteHandler.List`), so also sending
   *   `title=` would drop body-only matches and turn syntax like
   *   `"quoted phrases"`, `-excluded`, or `word or other` into literal title
   *   substrings on the backend. Old-pod rollout safety is handled by
   *   ordering — MiMi rolls the FTS-capable `logos-api` image ahead of this
   *   UI change — not by dual-sending from the UI.
   * - Legacy path (`legacyTitleOnly` true): sent as `?title=` only so an
   *   existing `/quotes?title=…` deep link keeps filtering through the
   *   pre-FTS wire shape until the user edits the search box, which
   *   normalizes the URL to `?q=` only.
   */
  q?: string;
  /**
   * When true with a non-empty trimmed `q`, wire the search as `?title=` only
   * (substring filter, pre-FTS wire shape) so legacy `?title=` deep links
   * keep filtering. Mutually exclusive with the canonical `?q=` only path
   * used when this is false/undefined.
   */
  legacyTitleOnly?: boolean;
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
  if (params.tagId && params.tagId.trim() !== "") {
    search.set("tag_id", params.tagId.trim());
  }
  const q = params.q?.trim() ?? "";
  if (q !== "") {
    if (params.legacyTitleOnly) {
      search.set("title", q);
    } else {
      search.set("q", q);
    }
  }
  const query = search.toString();
  return fetchJson<PaginatedResponse<Quote>>(`${API_PREFIX}?${query}`, {
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
