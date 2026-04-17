import { createBrowserRouter } from "react-router";
import { Layout } from "@/components/Layout";
import { AuthorsPage } from "@/pages/AuthorsPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { HomePage } from "@/pages/HomePage";
import { ImagesPage } from "@/pages/ImagesPage";
import { QuoteDetailPage } from "@/pages/QuoteDetailPage";
import { QuotesPage } from "@/pages/QuotesPage";
import { TagsPage } from "@/pages/TagsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "categories", element: <CategoriesPage /> },
      { path: "images", element: <ImagesPage /> },
      { path: "authors", element: <AuthorsPage /> },
      { path: "quotes", element: <QuotesPage /> },
      { path: "quotes/:id", element: <QuoteDetailPage /> },
      { path: "tags", element: <TagsPage /> },
    ],
  },
]);
