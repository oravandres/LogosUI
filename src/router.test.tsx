import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  type RouteObject,
} from "react-router";
import { RouteErrorFallback } from "@/pages/NotFoundPage";
import { routes } from "@/router";

/**
 * Mounts a `createMemoryRouter` against a route table at `path`. The
 * default points at the production `routes` so we can assert the catch-all
 * fires for unknown URLs against the real route configuration.
 *
 * The catch-all path itself does not call into the API, but pages that
 * sit above the catch-all (e.g. `/categories`) do — so we wrap with a
 * minimal `QueryClientProvider`. A bare client with no defaults is
 * sufficient because the catch-all and known-route assertions never depend
 * on a resolved network response.
 */
function renderRouter(
  path: string,
  routeTable: RouteObject[] = routes
) {
  const router = createMemoryRouter(routeTable, { initialEntries: [path] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe("router", () => {
  it("renders the friendly 404 page for an unknown path", () => {
    renderRouter("/this-route-does-not-exist");

    expect(
      screen.getByRole("heading", { name: /page not found/i })
    ).toBeInTheDocument();
    // Disambiguate the breadcrumb link from the header's "Home" nav link
    // (both point at "/"). The breadcrumb sits inside the page section
    // adjacent to the heading; scope the query there so the assertion
    // pins that the 404 page itself carries a working back-to-home link.
    const page = screen
      .getByRole("heading", { name: /page not found/i })
      .closest("section");
    expect(page).not.toBeNull();
    const breadcrumb = within(page!).getByRole("link", { name: /home/i });
    expect(breadcrumb).toHaveAttribute("href", "/");
  });

  it("keeps the header and main nav visible on the 404 page", () => {
    // The catch-all is nested under the layout route precisely so users
    // landing on a bad URL still have working navigation. Asserting the
    // nav is present pins this invariant.
    renderRouter("/another-bad-url");

    expect(
      screen.getByRole("navigation", { name: /main/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^logos$/i })
    ).toBeInTheDocument();
  });

  it("does not match the catch-all for a known route prefix", () => {
    // `/categories` is a valid route. Verifying it does NOT render
    // `<NotFoundPage>` guards against accidental over-broad `*` matching
    // (e.g. if the catch-all ever gets pulled out of the children array).
    renderRouter("/categories");

    expect(
      screen.queryByRole("heading", { name: /page not found/i })
    ).not.toBeInTheDocument();
  });

  it("renders the route error fallback when a route throws", () => {
    // The error log is expected; silence it so test output stays readable.
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function Boom(): never {
      throw new Error("kaboom");
    }

    // Use a stripped-down route table with no in-component `ErrorBoundary`
    // in scope (i.e. no `<Layout>`). Production layers two boundaries: the
    // in-component `<ErrorBoundary>` inside `Layout` catches *render*
    // errors first, and the data-router `errorElement` is the safety net
    // for everything that escapes (errors thrown above the in-component
    // boundary, or future loader / action throws). This test isolates the
    // outer net so the throw reaches `RouteErrorFallback` deterministically.
    const errorRoutes: RouteObject[] = [
      {
        path: "/",
        element: <Outlet />,
        errorElement: <RouteErrorFallback />,
        children: [{ path: "boom", element: <Boom /> }],
      },
    ];
    renderRouter("/boom", errorRoutes);

    expect(
      screen.getByRole("heading", { name: /something went wrong/i })
    ).toBeInTheDocument();
    // The raw error message must NOT be surfaced to the user.
    expect(screen.queryByText(/kaboom/i)).not.toBeInTheDocument();
    // …but the structured logger must capture it for observability.
    const matched = errSpy.mock.calls.some(
      (call) => call[0] === "[ui] route error"
    );
    expect(matched).toBe(true);

    errSpy.mockRestore();
  });

  it("layout route is wired with the route-error safety net", () => {
    // Pin the wiring so a future refactor that drops `errorElement` from
    // the layout route fails this assertion before it lands. The full
    // 404-Response → friendly-NotFoundPage path can only fire from a
    // loader (the only code path react-router wraps with an ErrorResponse
    // instance), and our routes do not use loaders today, so an
    // integration-style test here would not exercise real production
    // behavior.
    expect(routes).toHaveLength(1);
    expect(routes[0].errorElement).toBeDefined();
    expect(routes[0].path).toBe("/");
    // Catch-all must be a child of the layout route so the header / nav
    // remain rendered on 404.
    const children = routes[0].children ?? [];
    const catchAll = children.find((c) => c.path === "*");
    expect(catchAll).toBeDefined();
  });
});
