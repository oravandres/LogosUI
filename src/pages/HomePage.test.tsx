import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { HomePage } from "./HomePage";

const getHealthMock = vi.fn();
const listCategoriesMock = vi.fn();
const listImagesMock = vi.fn();
const listAuthorsMock = vi.fn();
const listTagsMock = vi.fn();
const listQuotesMock = vi.fn();
const getAuthorMock = vi.fn();

vi.mock("@/api/health", () => ({
  getHealth: (...args: unknown[]) => getHealthMock(...args),
}));

vi.mock("@/api/categories", () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
}));

vi.mock("@/api/images", () => ({
  listImages: (...args: unknown[]) => listImagesMock(...args),
}));

vi.mock("@/api/authors", () => ({
  listAuthors: (...args: unknown[]) => listAuthorsMock(...args),
  getAuthor: (...args: unknown[]) => getAuthorMock(...args),
}));

vi.mock("@/api/tags", () => ({
  listTags: (...args: unknown[]) => listTagsMock(...args),
}));

vi.mock("@/api/quotes", () => ({
  QUOTES_PAGE_SIZE: 20,
  listQuotes: (...args: unknown[]) => listQuotesMock(...args),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function envelope<T>(total: number, items: T[] = []) {
  return { items, total, limit: 1, offset: 0 };
}

describe("HomePage", () => {
  beforeEach(() => {
    getHealthMock.mockResolvedValue({ status: "healthy" });
    listCategoriesMock.mockResolvedValue(envelope(3));
    listImagesMock.mockResolvedValue(envelope(12));
    listAuthorsMock.mockResolvedValue(envelope(7));
    listTagsMock.mockResolvedValue(envelope(4));
    listQuotesMock.mockResolvedValue(
      envelope(42, [
        {
          id: "q-1",
          title: "On beginnings",
          text: "The journey of a thousand miles begins with a single step.",
          author_id: "a-1",
          image_id: null,
          category_id: null,
          created_at: "2020-01-02T00:00:00.000Z",
          updated_at: "2020-01-02T00:00:00.000Z",
        },
        {
          id: "q-2",
          title: "On persistence",
          text: "Fall seven times, stand up eight.",
          author_id: "a-2",
          image_id: null,
          category_id: null,
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      ])
    );
    getAuthorMock.mockImplementation((id: string) => {
      if (id === "a-1") {
        return Promise.resolve({
          id: "a-1",
          name: "Lao Tzu",
          bio: null,
          born_date: null,
          died_date: null,
          image_id: null,
          category_id: null,
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        });
      }
      return Promise.resolve({
        id: "a-2",
        name: "Japanese Proverb",
        bio: null,
        born_date: null,
        died_date: null,
        image_id: null,
        category_id: null,
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders healthy status and all five corpus counts", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("healthy")).toBeInTheDocument();
    });

    // The Quotes card reuses the recent-quotes envelope, so its total is 42.
    expect(
      screen.getByRole("link", { name: "Quotes: 42" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Authors: 7" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tags: 4" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Categories: 3" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Images: 12" })
    ).toBeInTheDocument();
  });

  it("renders recent quotes with resolved author names", async () => {
    renderPage();

    expect(
      await screen.findByRole("link", { name: "On beginnings" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "On persistence" })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/by Lao Tzu/)).toBeInTheDocument();
    });
    expect(screen.getByText(/by Japanese Proverb/)).toBeInTheDocument();

    // Dedup: each unique author is fetched exactly once even if reused.
    expect(getAuthorMock).toHaveBeenCalledTimes(2);
  });

  it("shows an em-dash when a single count request fails, leaving the rest intact", async () => {
    listImagesMock.mockRejectedValueOnce(
      new ApiError("images unavailable", 503, null)
    );
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Authors: 7" })
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "Images: —" })
    ).toBeInTheDocument();
  });

  it("shows the empty state when there are no quotes yet", async () => {
    listQuotesMock.mockResolvedValueOnce(envelope(0, []));
    renderPage();

    expect(await screen.findByText(/No quotes yet/i)).toBeInTheDocument();
    expect(getAuthorMock).not.toHaveBeenCalled();
  });

  it("surfaces the recent-quotes error without breaking the count cards", async () => {
    listQuotesMock.mockRejectedValueOnce(new ApiError("boom", 500, null));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });
    // The Quotes card has no envelope to read from, so it falls back to "—".
    expect(
      screen.getByRole("link", { name: "Quotes: —" })
    ).toBeInTheDocument();
    // Independent cards still render from their own successful fetches.
    expect(
      screen.getByRole("link", { name: "Authors: 7" })
    ).toBeInTheDocument();
  });
});
