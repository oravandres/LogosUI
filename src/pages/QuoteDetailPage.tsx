import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError } from "@/api/client";
import { getAuthor } from "@/api/authors";
import { getCategory } from "@/api/categories";
import { getImage } from "@/api/images";
import { deleteQuote, getQuote } from "@/api/quotes";
import { listQuoteTags } from "@/api/tags";
import type { Author, Category, Image, Quote, Tag } from "@/api/types";

/**
 * Read-oriented page for a single quote at `/quotes/:id`.
 *
 * Resolves the quote, its author (with optional portrait), the optional
 * quote image, the optional category, and the per-quote tag list. Auxiliary
 * lookups are intentionally tolerant: a missing portrait, a 404 on the
 * category, or a 404 on the per-quote tags list never tears down the page —
 * only a missing quote itself produces the dedicated not-found state.
 *
 * Cache keys are aligned with the rest of the app: `["author", id]` is
 * shared with the home dashboard's recent-quotes resolver, and
 * `["quote-tags", id]` is shared with the quotes list's per-row chip cell so
 * the same fetch backs both views.
 */
export function QuoteDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const quoteQuery = useQuery({
    queryKey: ["quote", id],
    queryFn: ({ signal }) => getQuote(id, signal),
    enabled: id !== "",
  });
  const quote: Quote | undefined = quoteQuery.data;

  const authorId = quote?.author_id ?? "";
  const authorQuery = useQuery({
    queryKey: ["author", authorId],
    queryFn: ({ signal }) => getAuthor(authorId, signal),
    enabled: authorId !== "",
  });
  const author: Author | undefined = authorQuery.data;

  const portraitId = author?.image_id ?? "";
  const portraitQuery = useQuery({
    queryKey: ["image", portraitId],
    queryFn: ({ signal }) => getImage(portraitId, signal),
    enabled: portraitId !== "",
  });
  const portrait: Image | undefined = portraitQuery.data;

  const quoteImageId = quote?.image_id ?? "";
  const quoteImageQuery = useQuery({
    queryKey: ["image", quoteImageId],
    queryFn: ({ signal }) => getImage(quoteImageId, signal),
    enabled: quoteImageId !== "",
  });
  const quoteImage: Image | undefined = quoteImageQuery.data;

  const categoryId = quote?.category_id ?? "";
  const categoryQuery = useQuery({
    queryKey: ["category", categoryId],
    queryFn: ({ signal }) => getCategory(categoryId, signal),
    enabled: categoryId !== "",
  });
  const category: Category | undefined = categoryQuery.data;

  const tagsQuery = useQuery({
    queryKey: ["quote-tags", id],
    queryFn: ({ signal }) => listQuoteTags(id, signal),
    enabled: id !== "",
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuote(id),
    onSuccess: async () => {
      // Drop every cache entry that references this quote so list pages and
      // the home dashboard reflect the deletion the moment the user lands
      // back on them. The per-quote `["quote", id]` and `["quote-tags", id]`
      // entries are also removed; otherwise a back-button to this URL would
      // briefly render the deleted quote from cache before refetching 404.
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      queryClient.removeQueries({ queryKey: ["quote", id] });
      queryClient.removeQueries({ queryKey: ["quote-tags", id] });
      navigate("/quotes");
    },
  });

  // Distinguish a real 404 on the quote itself from any other failure —
  // 404 gets a friendly fallback, everything else surfaces the message.
  const quoteNotFound =
    quoteQuery.isError &&
    quoteQuery.error instanceof ApiError &&
    quoteQuery.error.status === 404;

  if (id === "") {
    return <NotFound />;
  }

  if (quoteNotFound) {
    return <NotFound />;
  }

  return (
    <section className="page quote-detail">
      <p className="muted breadcrumb">
        <Link to="/quotes">← All quotes</Link>
      </p>

      {quoteQuery.isPending && !quote ? (
        <p className="muted">Loading…</p>
      ) : null}

      {quoteQuery.isError && !quote ? (
        <p className="error" role="alert">
          {errorMessage(quoteQuery.error, "Failed to load quote")}
        </p>
      ) : null}

      {quote ? (
        <>
          <header className="quote-detail-header">
            <h2>{quote.title}</h2>
            <div className="btn-group">
              <Link
                to="/quotes"
                className="btn btn-small"
                aria-label={`Edit ${quote.title} from the list`}
              >
                Edit in list
              </Link>
              <button
                type="button"
                className="btn btn-small btn-danger"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(`Delete quote "${quote.title}"?`)
                  ) {
                    deleteMutation.mutate();
                  }
                }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </header>

          {deleteMutation.error ? (
            <p className="error" role="alert">
              {errorMessage(deleteMutation.error, "Failed to delete quote")}
            </p>
          ) : null}

          <article className="panel quote-body">
            <p className="quote-text">{quote.text}</p>
          </article>

          <AuthorBlock
            quoteAuthorId={quote.author_id}
            author={author}
            authorState={summarize(authorQuery)}
            portrait={portrait}
            portraitErrored={portraitQuery.isError}
          />

          {quoteImageId ? (
            <div className="panel">
              <h3 className="panel-title">Image</h3>
              {quoteImageQuery.isPending ? (
                <p className="muted">Loading image…</p>
              ) : quoteImage ? (
                <figure className="quote-image">
                  <img
                    className="quote-image-img"
                    src={quoteImage.url}
                    alt={quoteImage.alt_text ?? ""}
                  />
                  {quoteImage.alt_text ? (
                    <figcaption className="muted">
                      {quoteImage.alt_text}
                    </figcaption>
                  ) : null}
                </figure>
              ) : (
                <p className="muted">
                  Image reference{" "}
                  <code className="id-chip">{quoteImageId}</code> could not be
                  loaded.
                </p>
              )}
            </div>
          ) : null}

          <div className="panel">
            <h3 className="panel-title">Classification</h3>
            <dl className="meta-list">
              <div className="meta-row">
                <dt>Category</dt>
                <dd>
                  {!categoryId ? (
                    <span className="muted">None</span>
                  ) : categoryQuery.isPending ? (
                    <span className="muted">Loading…</span>
                  ) : category ? (
                    <span className="tag-chip tag-chip-static">
                      {category.name}
                    </span>
                  ) : (
                    <code className="id-chip" title="Category lookup failed">
                      {categoryId}
                    </code>
                  )}
                </dd>
              </div>
              <div className="meta-row">
                <dt>Tags</dt>
                <dd>
                  <TagList query={tagsQuery} />
                </dd>
              </div>
              <div className="meta-row">
                <dt>Created</dt>
                <dd className="muted">{formatDate(quote.created_at)}</dd>
              </div>
              <div className="meta-row">
                <dt>Updated</dt>
                <dd className="muted">{formatDate(quote.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </>
      ) : null}
    </section>
  );
}

type AuthorState = "pending" | "success" | "error";

function summarize(q: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}): AuthorState {
  if (q.isSuccess) return "success";
  if (q.isError) return "error";
  return "pending";
}

function AuthorBlock({
  quoteAuthorId,
  author,
  authorState,
  portrait,
  portraitErrored,
}: {
  quoteAuthorId: string;
  author: Author | undefined;
  authorState: AuthorState;
  portrait: Image | undefined;
  portraitErrored: boolean;
}) {
  return (
    <div className="panel">
      <h3 className="panel-title">Author</h3>
      <div className="author-block">
        <div className="author-portrait">
          {author?.image_id ? (
            portrait ? (
              // The author's name is already announced as the adjacent
              // heading; without distinct alt text the portrait is purely
              // decorative, so an empty alt avoids screen readers
              // double-announcing the name.
              <img
                className="author-portrait-img"
                src={portrait.url}
                alt={portrait.alt_text ?? ""}
              />
            ) : portraitErrored ? (
              <div className="author-portrait-fallback" aria-hidden="true">
                {initials(author.name)}
              </div>
            ) : (
              <div
                className="author-portrait-fallback author-portrait-loading"
                aria-label="Loading portrait"
              />
            )
          ) : (
            <div className="author-portrait-fallback" aria-hidden="true">
              {author ? initials(author.name) : "?"}
            </div>
          )}
        </div>
        <div className="author-text">
          {authorState === "pending" ? (
            <p className="muted">Loading author…</p>
          ) : authorState === "error" ? (
            <p className="error">
              Could not load author{" "}
              <code className="id-chip">{quoteAuthorId}</code>.
            </p>
          ) : author ? (
            <>
              <p className="author-name">{author.name}</p>
              {author.bio ? (
                <p className="author-bio">{author.bio}</p>
              ) : null}
              {author.born_date || author.died_date ? (
                <p className="muted author-dates">
                  {formatLifeSpan(author.born_date, author.died_date)}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TagList({
  query,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data?: Tag[];
  };
}) {
  if (query.isPending) {
    return <span className="muted">Loading…</span>;
  }
  if (query.isError) {
    // 404 specifically means the parent quote is gone (rare here because the
    // outer `quoteQuery` already guards 404, but possible mid-render between
    // success and refetch). Other errors render as a quiet em-dash; the user
    // already has the rest of the page to read.
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <span className="muted">—</span>;
    }
    return <span className="muted">—</span>;
  }
  const tags = query.data ?? [];
  if (tags.length === 0) {
    return <span className="muted">None</span>;
  }
  return (
    <ul className="tag-chip-list tag-chip-list-readonly">
      {tags.map((t) => (
        <li key={t.id} className="tag-chip tag-chip-static">
          {t.name}
        </li>
      ))}
    </ul>
  );
}

function NotFound() {
  return (
    <section className="page">
      <p className="muted breadcrumb">
        <Link to="/quotes">← All quotes</Link>
      </p>
      <h2>Quote not found</h2>
      <p className="muted">
        This quote may have been deleted, or the link is wrong.
      </p>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatLifeSpan(
  born: string | null,
  died: string | null
): string {
  const b = born ? formatYear(born) : "?";
  const d = died ? formatYear(died) : "present";
  return `${b} – ${d}`;
}

// The API stores `born_date` / `died_date` as ISO 8601 strings that may carry
// signed BCE years (e.g. `-0383-01-01T00:00:00.000Z`). The JS `Date`
// constructor only reliably parses the extended `±YYYYYY-MM-DD` form, not the
// 4-digit `-YYYY-` shape the backend uses, and V8 returns `Invalid Date` for
// it — which would otherwise leak the raw ISO string into the UI for any
// pre-modern author. Extract the leading signed year from the string itself
// so the formatter never depends on locale-sensitive `Date` parsing.
const YEAR_PREFIX = /^(-?)(\d+)/;

function formatYear(iso: string): string {
  const m = YEAR_PREFIX.exec(iso);
  if (!m) return iso;
  const sign = m[1];
  const year = Number.parseInt(m[2], 10);
  if (!Number.isFinite(year)) return iso;
  // Render negative years as "<n> BC" rather than the raw signed integer.
  // We deliberately do not adjust for the historical "no year zero"
  // convention: the API stores astronomical years and the UI surfaces them
  // faithfully so the displayed value round-trips with the stored value.
  return sign === "-" ? `${year} BC` : String(year);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
