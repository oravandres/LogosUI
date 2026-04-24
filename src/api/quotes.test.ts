import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listQuotes } from "@/api/quotes";

/**
 * The request URL issued by `listQuotes` is the contract against the Logos
 * backend. These tests pin its wire shape under every facet combination so
 * (a) a refactor cannot silently reintroduce the `?q=` + `?title=` dual-send
 * that the FTS-aware Logos handler composes as AND (PR review #23, comment
 * on `src/api/quotes.ts`), and (b) the legacy `?title=…` deep-link path
 * keeps working through the pre-FTS wire shape while the URL in the browser
 * still reads `?title=`.
 *
 * The client is stubbed at the `fetch` boundary so the assertions run against
 * the exact URL string the browser would ship. Reading it back from the
 * first `fetch` call arg keeps the test honest against URLSearchParams
 * ordering quirks — we parse the returned URL and check the params by name.
 */
function stubFetchOk<T>(body: T) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const arg = fetchMock.mock.calls[0]?.[0];
  // `fetch` accepts a string or a Request; `fetchJson` passes the resolved
  // absolute URL string (see `src/api/client.ts::buildUrl`).
  expect(typeof arg).toBe("string");
  return new URL(arg as string);
}

const emptyPage = { items: [], total: 0, offset: 0, limit: 20 };

describe("listQuotes URL wire shape", () => {
  beforeEach(() => {
    // The client reads `VITE_LOGOS_API_BASE_URL` via
    // `import.meta.env`; the Vitest env already has `DEV=true` so
    // `getApiBaseUrl()` falls back to `http://localhost:8000`, which is
    // enough for URL parsing. No further setup needed.
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends `?q=` only on the canonical search path (no dual-send of `?title=`)", async () => {
    // Regression for PR #23 review comment: the FTS-aware Logos handler
    // composes `title` ILIKE with the tsvector filter as AND, so also
    // sending `title=` would drop body-only matches and turn FTS syntax
    // like quoted phrases, `-excluded`, or `or` into literal title
    // substrings on the backend. The UI must send `q` and only `q`.
    const fetchMock = stubFetchOk(emptyPage);

    await listQuotes({ q: "virtue" });

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/quotes");
    expect(url.searchParams.get("q")).toBe("virtue");
    expect(url.searchParams.has("title")).toBe(false);
  });

  it("sends `?title=` only when legacyTitleOnly is set (pre-FTS deep links)", async () => {
    // `QuotesPage` forwards `legacyTitleOnly: true` on first render when
    // the URL carries `?title=…` but no `?q=…`, so bookmarks from before
    // the `?title` -> `?q` swap keep filtering through the pre-FTS wire
    // shape until the user edits the search box (which normalizes the
    // URL back to `?q=` only).
    const fetchMock = stubFetchOk(emptyPage);

    await listQuotes({ q: "virtue", legacyTitleOnly: true });

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("title")).toBe("virtue");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("passes the full FTS syntax verbatim on `?q=` (quoted phrases, negation, or)", async () => {
    // The Logos handler is a pure pass-through into
    // `websearch_to_tsquery('english', q)`, so the UI must not mangle the
    // input. URL encoding is `fetch`'s responsibility — we assert the
    // decoded value round-trips byte-for-byte.
    const fetchMock = stubFetchOk(emptyPage);

    const raw = '"know thyself" -fortune or wisdom';
    await listQuotes({ q: raw });

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("q")).toBe(raw);
    expect(url.searchParams.has("title")).toBe(false);
  });

  it("treats empty / whitespace-only `q` as absent on both canonical and legacy paths", async () => {
    // Matches the other facets' "empty means absent" convention and
    // prevents degenerating the server's `ts_rank_cd` ordering to zero
    // across the board. The `legacyTitleOnly` flag must not smuggle an
    // empty string onto the URL either.
    for (const [label, q] of [
      ["empty", ""] as const,
      ["whitespace", "   "] as const,
    ]) {
      for (const legacyTitleOnly of [false, true]) {
        const fetchMock = stubFetchOk(emptyPage);
        await listQuotes({ q, legacyTitleOnly });
        const url = requestedUrl(fetchMock);
        expect(
          url.searchParams.has("q"),
          `q present for ${label} q (legacyTitleOnly=${legacyTitleOnly})`
        ).toBe(false);
        expect(
          url.searchParams.has("title"),
          `title present for ${label} q (legacyTitleOnly=${legacyTitleOnly})`
        ).toBe(false);
        vi.unstubAllGlobals();
      }
    }
  });

  it("composes `?q=` with every other facet on a single request", async () => {
    // Pins that FTS does not replace or swallow the other filters — the
    // UI keeps sending `author_id`, `category_id`, and `tag_id` alongside
    // `q`, which Logos ANDs together in SQL. Matches the server-side pin
    // in `internal/handler/quotes_test.go::TestQuoteList_QComposesWithFacets`.
    const fetchMock = stubFetchOk(emptyPage);

    await listQuotes({
      authorId: "author-1",
      categoryId: "cat-1",
      tagId: "tag-1",
      q: "virtue",
      offset: 20,
      limit: 10,
    });

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("author_id")).toBe("author-1");
    expect(url.searchParams.get("category_id")).toBe("cat-1");
    expect(url.searchParams.get("tag_id")).toBe("tag-1");
    expect(url.searchParams.get("q")).toBe("virtue");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.has("title")).toBe(false);
  });

  it("trims surrounding whitespace from `q` before wiring it to the URL", async () => {
    // The page's debounced commit already trims before calling
    // `listQuotes`, but deep links and tests may pass a padded value
    // directly. Trimming here matches the server convention that a
    // whitespace-only value is "absent" and prevents a trailing space
    // from becoming a meaningless term in the FTS parser.
    const fetchMock = stubFetchOk(emptyPage);

    await listQuotes({ q: "  virtue  " });

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("q")).toBe("virtue");
    expect(url.searchParams.has("title")).toBe(false);
  });
});
