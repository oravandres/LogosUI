import { Link, isRouteErrorResponse, useRouteError } from "react-router";

/**
 * Friendly 404 page used by the catch-all `*` route in `src/router.tsx`
 * **and** by `QuoteDetailPage` when the requested quote id resolves to a
 * 404. Sits inside `<Layout>` (because it is a child of the layout route)
 * so the header / nav remain available for the user to navigate elsewhere.
 *
 * The breadcrumb intentionally points at `/` rather than at any specific
 * resource list: the catch-all has no resource context, and surfacing the
 * same destination from the QuoteDetailPage 404 path keeps the two render
 * paths identical (the URL bar already tells the user what they were
 * looking for).
 */
export function NotFoundPage() {
  return (
    <section className="page">
      <p className="muted breadcrumb">
        <Link to="/">← Home</Link>
      </p>
      <h2>Page not found</h2>
      <p className="muted">
        This page may have been moved or deleted, or the link is wrong.
      </p>
    </section>
  );
}

/**
 * React Router data-router `errorElement`. Acts as the safety net when an
 * error escapes the in-component `<ErrorBoundary>` inside `Layout` — for
 * example an error thrown during the initial render of `Layout` itself,
 * a render-phase throw that bypasses class boundaries (effects emitting
 * synchronously), or a future `loader` / `action` rejection.
 *
 * The raw error message is deliberately not surfaced to the user (parity
 * with `<ErrorBoundary>` and `AGENTS.md` "do not leak internals"); the
 * structured logger picks it up via `console.error("[ui] route error",
 * …)`. Routes that intentionally throw a `Response` with status 404 land
 * here too — those flow into the friendly `<NotFoundPage>` instead of the
 * generic "something went wrong" surface.
 */
export function RouteErrorFallback() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }
  console.error("[ui] route error", error);
  return (
    <section className="page">
      <h2>Something went wrong</h2>
      <p className="muted">
        The application hit an unexpected error. Try refreshing the page,
        or <Link to="/">return home</Link>.
      </p>
    </section>
  );
}
