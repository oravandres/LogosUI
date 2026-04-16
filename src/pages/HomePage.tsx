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

  const authorNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (let i = 0; i < authorIds.length; i++) {
      const r = authorQueries[i];
      if (r?.isSuccess) m.set(authorIds[i], r.data.name);
    }
    return m;
  }, [authorIds, authorQueries]);

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
        {recentQuotes.isPending && <p className="muted">Loading…</p>}
        {recentQuotes.isError && (
          <p className="error" role="alert">
            {recentQuotes.error instanceof ApiError
              ? recentQuotes.error.message
              : recentQuotes.error instanceof Error
                ? recentQuotes.error.message
                : "Failed to load recent quotes"}
          </p>
        )}
        {recentQuotes.isSuccess && recentQuotes.data.items.length === 0 && (
          <p className="muted">
            No quotes yet. <Link to="/quotes">Create one.</Link>
          </p>
        )}
        {recentQuotes.isSuccess && recentQuotes.data.items.length > 0 && (
          <ul className="recent-list">
            {recentQuotes.data.items.map((q) => {
              const authorName = authorNameById.get(q.author_id);
              return (
                <li key={q.id} className="recent-item">
                  <Link to="/quotes" className="recent-title">
                    {q.title}
                  </Link>
                  <p className="recent-text">{q.text}</p>
                  <p className="recent-meta muted">
                    by{" "}
                    {authorName ? (
                      authorName
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
  const value = q.isPending
    ? "…"
    : q.isError || q.data == null
      ? "—"
      : q.data.total.toLocaleString();
  return (
    <li className="stat-card">
      <Link to={to} className="stat-card-link" aria-label={`${label}: ${value}`}>
        <span className="stat-number">{value}</span>
        <span className="stat-label">{label}</span>
      </Link>
    </li>
  );
}
