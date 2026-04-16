import { fetchJson, postJson } from "@/api/client";
import type { PaginatedResponse, Tag, TagWriteBody } from "@/api/types";

const TAGS_PREFIX = "/api/v1/tags";
const QUOTES_PREFIX = "/api/v1/quotes";

/** Matches Logos `model.DefaultLimit`. */
export const TAGS_PAGE_SIZE = 20;

/**
 * Matches Logos `model.MaxLimit`; the server caps any larger request down to
 * this value. Used when walking every tag for a client-side picker.
 */
const MAX_PAGE = 100;

/** Defensive upper bound on total tags fetched for a per-quote picker. */
const LIST_ALL_MAX = 500;

export type ListTagsParams = {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export function listTags(
  params: ListTagsParams = {}
): Promise<PaginatedResponse<Tag>> {
  const limit = params.limit ?? TAGS_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  search.set("offset", String(offset));
  return fetchJson<PaginatedResponse<Tag>>(
    `${TAGS_PREFIX}?${search.toString()}`,
    { signal: params.signal }
  );
}

/**
 * Returns every tag on the server, paging through at `MAX_PAGE` per request.
 * Intended for small-to-medium tag corpora powering the per-quote tag picker;
 * capped by `LIST_ALL_MAX` so a misconfigured or runaway dataset cannot hang
 * the page. Callers should degrade gracefully if `total` exceeds the cap.
 */
export async function listAllTags(signal?: AbortSignal): Promise<{
  items: Tag[];
  total: number;
  truncated: boolean;
}> {
  const first = await listTags({ limit: MAX_PAGE, offset: 0, signal });
  const total = first.total;
  const items: Tag[] = [...first.items];
  while (items.length < total && items.length < LIST_ALL_MAX) {
    const next = await listTags({
      limit: MAX_PAGE,
      offset: items.length,
      signal,
    });
    if (next.items.length === 0) break;
    items.push(...next.items);
  }
  return {
    items,
    total,
    truncated: total > items.length,
  };
}

export function createTag(body: TagWriteBody): Promise<Tag> {
  return postJson<Tag>(TAGS_PREFIX, body);
}

export function deleteTag(id: string): Promise<void> {
  return fetchJson<void>(`${TAGS_PREFIX}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ── Per-quote tag associations ────────────────────────────────────────────

/**
 * Returns tags associated with a quote.
 * Server returns a plain array (not a paginated envelope) on success.
 * `404` indicates the parent quote no longer exists.
 */
export function listQuoteTags(
  quoteId: string,
  signal?: AbortSignal
): Promise<Tag[]> {
  return fetchJson<Tag[]>(
    `${QUOTES_PREFIX}/${encodeURIComponent(quoteId)}/tags`,
    { signal }
  );
}

/**
 * Associates a tag with a quote.
 * `404` → parent quote missing; `422` → tag_id is invalid (child FK violation).
 */
export function addTagToQuote(
  quoteId: string,
  tagId: string
): Promise<void> {
  return postJson<void>(
    `${QUOTES_PREFIX}/${encodeURIComponent(quoteId)}/tags`,
    { tag_id: tagId }
  );
}

export function removeTagFromQuote(
  quoteId: string,
  tagId: string
): Promise<void> {
  return fetchJson<void>(
    `${QUOTES_PREFIX}/${encodeURIComponent(quoteId)}/tags/${encodeURIComponent(tagId)}`,
    { method: "DELETE" }
  );
}
