import { createBrowserRouter, type RouteObject } from "react-router";
import { Layout } from "@/components/Layout";
import { AuthorsPage } from "@/pages/AuthorsPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { HomePage } from "@/pages/HomePage";
import { ImagesPage } from "@/pages/ImagesPage";
import { NotFoundPage, RouteErrorFallback } from "@/pages/NotFoundPage";
import { QuoteDetailPage } from "@/pages/QuoteDetailPage";
import { QuotesPage } from "@/pages/QuotesPage";
import { TagsPage } from "@/pages/TagsPage";

/**
 * Route configuration. Exported separately from `router` so tests can mount
 * the same route table inside a `createMemoryRouter` without instantiating
 * the production browser-history router.
 *
 * The `*` catch-all is nested **under** the layout route so an unknown URL
 * still renders the header / nav and the user can navigate elsewhere.
 * `errorElement` lives on the layout route as the data-router safety net
 * for errors that escape the in-component `<ErrorBoundary>` inside
 * `Layout`.
 */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "categories", element: <CategoriesPage /> },
      { path: "images", element: <ImagesPage /> },
      { path: "authors", element: <AuthorsPage /> },
      { path: "quotes", element: <QuotesPage /> },
      { path: "quotes/:id", element: <QuoteDetailPage /> },
      { path: "tags", element: <TagsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
