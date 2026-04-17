import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiError } from "@/api/client";
import { getAuthor, listAuthors } from "@/api/authors";
import { listCategories } from "@/api/categories";
import { getHealth } from "@/api/health";
import { listImages } from "@/api/images";
import { listQuotes } from "@/api/quotes";
import { listTags } from "@/api/tags";
import { ListSkeleton, Skeleton } from "@/components/Skeleton";

// React Query keeps the previously resolved `data` when a refetch errors and
// raises `isError` alongside it. Treat cached data as the source of truth and
// only fall back to the pending/empty placeholders when no data has ever been
// loaded — otherwise a transient network blip would erase totals the user was
// already looking at.
type CountQuery = {
  isPending: boolean;
  isError: boolean;
  data?: { total: number } | undefined;
};

export function HomePage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getHealth(signal),
  });

  // Cheap total-only probes: request 1 item and read `total`.
  // Distinct query keys from the per-section pages so filters/pagination state
  // there never collides with the dashboard cards.
  const categoriesCount = useQuery({
    queryKey: ["home", "count", "categories"],
    queryFn: ({ signal }) => listCategories({ limit: 1, signal }),
  });
  const imagesCount = useQuery({
    queryKey: ["home", "count", "images"],
    queryFn: ({ signal }) => listImages({ limit: 1, signal }),
  });
  const authorsCount = useQuery({
    queryKey: ["home", "count", "authors"],
    queryFn: ({ signal }) => listAuthors({ limit: 1, signal }),
  });
  const tagsCount = useQuery({
    queryKey: ["home", "count", "tags"],
    queryFn: ({ signal }) => listTags({ limit: 1, signal }),
  });

  // Recent quotes double as the quotes-count source since the response envelope
  // carries both `total` and the first N items (server-sorted by created_at DESC).
  const recentQuotes = useQuery({
    queryKey: ["home", "recent-quotes"],
    queryFn: ({ signal }) => listQuotes({ limit: 5, signal }),
  });

  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const q of recentQuotes.data?.items ?? []) {
      if (q.author_id) ids.add(q.author_id);
    }
    return Array.from(ids);
  }, [recentQuotes.data]);

  // Resolve author display names in parallel. Each result is cached under the
  // shared ["author", id] key so repeat renders and the Authors page reuse it.
  const authorQueries = useQueries({
    queries: authorIds.map((id) => ({
      queryKey: ["author", id],
      queryFn: ({ signal }: { signal?: AbortSignal }) => getAuthor(id, signal),
    })),
  });

  // Per-author display state: "success" → the fetched name, "error" → a stable
  // "Unknown author" fallback so screen readers aren't stuck announcing a
  // loading hint forever, otherwise the row renders the pending placeholder.
  const authorDisplayById = useMemo(() => {
    const m = new Map<string, { kind: "success"; name: string } | { kind: "error" }>();
    for (let i = 0; i < authorIds.length; i++) {
      const r = authorQueries[i];
      if (r?.isSuccess) m.set(authorIds[i], { kind: "success", name: r.data.name });
      else if (r?.isError) m.set(authorIds[i], { kind: "error" });
    }
    return m;
  }, [authorIds, authorQueries]);

  const quotesItems = recentQuotes.data?.items;
  const hasRecentData = quotesItems !== undefined;
  // When a refetch fails but cached data is still available, surface the error
  // as a non-blocking warning banner above the list rather than tearing down
  // the list the user was already reading.
  const recentError =
    recentQuotes.isError && hasRecentData
      ? errorMessage(recentQuotes.error, "Failed to refresh recent quotes")
      : null;

  return (
    <section className="page">
      <h2>Home</h2>
      <p className="muted">Your Logos corpus at a glance.</p>

      <div className="panel">
        <h3 className="panel-title">API status</h3>
        {health.isPending && <p>Checking…</p>}
        {health.isError && (
          <p className="error" role="alert">
            {health.error instanceof ApiError
              ? `${health.error.message} (HTTP ${health.error.status})`
              : health.error instanceof Error
                ? health.error.message
                : "Request failed"}
          </p>
        )}
        {health.isSuccess && (
          <p className="ok">
            Logos reports <strong>{health.data.status}</strong>
          </p>
        )}
      </div>

      <div className="panel">
        <h3 className="panel-title">Corpus</h3>
        <ul className="stat-grid" role="list">
          <StatCard to="/quotes" label="Quotes" q={recentQuotes} />
          <StatCard to="/authors" label="Authors" q={authorsCount} />
          <StatCard to="/tags" label="Tags" q={tagsCount} />
          <StatCard to="/categories" label="Categories" q={categoriesCount} />
          <StatCard to="/images" label="Images" q={imagesCount} />
        </ul>
      </div>

      <div className="panel">
        <h3 className="panel-title">Recent quotes</h3>
        {recentError && (
          <p className="error" role="status">
            {recentError}
          </p>
        )}
        {!hasRecentData && recentQuotes.isPending && (
          <ListSkeleton rows={3} ariaLabel="Loading recent quotes" />
        )}
        {!hasRecentData && recentQuotes.isError && (
          <p className="error" role="alert">
            {errorMessage(recentQuotes.error, "Failed to load recent quotes")}
          </p>
        )}
        {hasRecentData && quotesItems.length === 0 && (
          <p className="muted">
            No quotes yet. <Link to="/quotes">Create one.</Link>
          </p>
        )}
        {hasRecentData && quotesItems.length > 0 && (
          <ul className="recent-list">
            {quotesItems.map((q) => {
              const author = authorDisplayById.get(q.author_id);
              return (
                <li key={q.id} className="recent-item">
                  <Link to={`/quotes/${q.id}`} className="recent-title">
                    {q.title}
                  </Link>
                  <p className="recent-text">{q.text}</p>
                  <p className="recent-meta muted">
                    by{" "}
                    {author?.kind === "success" ? (
                      author.name
                    ) : author?.kind === "error" ? (
                      <span>Unknown author</span>
                    ) : (
                      <span aria-label="Loading author">…</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function StatCard({
  to,
  label,
  q,
}: {
  to: string;
  label: string;
  q: CountQuery;
}) {
  // Prefer the last known total whenever it is available — even if the most
  // recent refetch errored — so a brief network blip does not blank totals
  // that were already successfully loaded. Fall back to a skeleton while the
  // initial fetch is in flight, and to the em-dash only when we are neither
  // pending nor have any data in hand.
  const hasValue = q.data?.total !== undefined;
  const displayValue = hasValue
    ? q.data!.total.toLocaleString()
    : q.isPending
      ? null
      : "—";
  const ariaValue = hasValue
    ? displayValue!
    : q.isPending
      ? "loading"
      : "—";
  return (
    <li className="stat-card">
      <Link
        to={to}
        className="stat-card-link"
        aria-label={`${label}: ${ariaValue}`}
      >
        <span className="stat-number">
          {displayValue === null ? (
            <Skeleton width="2.5rem" height="1.5rem" />
          ) : (
            displayValue
          )}
        </span>
        <span className="stat-label">{label}</span>
      </Link>
    </li>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
