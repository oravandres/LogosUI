import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { ToastProvider } from "@/components/ToastProvider";
import { QuoteDetailPage } from "./QuoteDetailPage";

const getQuoteMock = vi.fn();
const deleteQuoteMock = vi.fn();
const getAuthorMock = vi.fn();
const getCategoryMock = vi.fn();
const getImageMock = vi.fn();
const listQuoteTagsMock = vi.fn();

vi.mock("@/api/quotes", () => ({
  getQuote: (...args: unknown[]) => getQuoteMock(...args),
  deleteQuote: (...args: unknown[]) => deleteQuoteMock(...args),
}));

vi.mock("@/api/authors", () => ({
  getAuthor: (...args: unknown[]) => getAuthorMock(...args),
}));

vi.mock("@/api/categories", () => ({
  getCategory: (...args: unknown[]) => getCategoryMock(...args),
}));

vi.mock("@/api/images", () => ({
  getImage: (...args: unknown[]) => getImageMock(...args),
}));

vi.mock("@/api/tags", () => ({
  listQuoteTags: (...args: unknown[]) => listQuoteTagsMock(...args),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderAt(
  path: string,
  client: QueryClient = makeClient()
): { container: HTMLElement } {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/quotes" element={<div>quotes-list-stub</div>} />
            <Route path="/quotes/:id" element={<QuoteDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function quote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "q-1",
    title: "On Virtue",
    text: "Virtue is a habit.\n\nNot a single act.",
    author_id: "a-1",
    image_id: null,
    category_id: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function author(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a-1",
    name: "Aristotle",
    bio: "Greek philosopher.",
    born_date: "-0383-01-01T00:00:00.000Z",
    died_date: "-0321-01-01T00:00:00.000Z",
    image_id: null,
    category_id: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function image(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "img-1",
    url: "https://example.test/img.jpg",
    alt_text: "an image",
    category_id: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function category(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c-1",
    name: "Ethics",
    type: "quote",
    created_at: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("QuoteDetailPage", () => {
  beforeEach(() => {
    getQuoteMock.mockResolvedValue(quote());
    getAuthorMock.mockResolvedValue(author());
    getCategoryMock.mockResolvedValue(category());
    getImageMock.mockResolvedValue(image());
    listQuoteTagsMock.mockResolvedValue([]);
    deleteQuoteMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the quote title, full text, and resolved author name", async () => {
    renderAt("/quotes/q-1");

    expect(
      await screen.findByRole("heading", { level: 2, name: "On Virtue" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Virtue is a habit\./, { exact: false })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Aristotle")).toBeInTheDocument();
    });
    expect(screen.getByText("Greek philosopher.")).toBeInTheDocument();
    // The quote API was called with the route param.
    expect(getQuoteMock).toHaveBeenCalledWith("q-1", expect.anything());
  });

  it("shows a neutral portrait loading placeholder (no '?') while the author query is pending", async () => {
    // Hold the author request in-flight so we can observe the pending state.
    let resolveAuthor!: (value: ReturnType<typeof author>) => void;
    getAuthorMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof author>>((r) => {
          resolveAuthor = r;
        })
    );

    const { container } = renderAt("/quotes/q-1");

    // Quote resolves, author does not yet.
    await screen.findByText("On Virtue");

    // Author-text skeleton is the live-region announcing the pending author.
    expect(
      await screen.findByRole("status", { name: /loading author/i })
    ).toBeInTheDocument();

    // Portrait slot renders the neutral loading placeholder, not the "?"
    // missing-data glyph.
    const loadingPortrait = container.querySelector(
      ".author-portrait .author-portrait-loading"
    );
    expect(loadingPortrait).not.toBeNull();
    expect(container.querySelector(".author-portrait")).not.toHaveTextContent(
      "?"
    );

    resolveAuthor(author());
    await screen.findByText("Aristotle");
  });

  it("does not fetch ancillary resources when the quote omits them", async () => {
    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    expect(getCategoryMock).not.toHaveBeenCalled();
    // Author has no portrait, quote has no image: getImage is never called.
    expect(getImageMock).not.toHaveBeenCalled();
  });

  it("renders the quote image and category chip when present", async () => {
    getQuoteMock.mockResolvedValue(
      quote({ image_id: "img-q", category_id: "c-1" })
    );
    getImageMock.mockImplementation((id: string) =>
      Promise.resolve(image({ id, url: `https://example.test/${id}.jpg` }))
    );

    renderAt("/quotes/q-1");

    const img = await screen.findByAltText("an image");
    expect(img).toHaveAttribute("src", "https://example.test/img-q.jpg");
    expect(await screen.findByText("Ethics")).toBeInTheDocument();
  });

  it("renders the author portrait with empty alt when the image carries no alt text", async () => {
    getAuthorMock.mockResolvedValue(author({ image_id: "img-portrait" }));
    getImageMock.mockResolvedValue(
      image({
        id: "img-portrait",
        url: "https://example.test/portrait.jpg",
        alt_text: null,
      })
    );

    const { container } = renderAt("/quotes/q-1");

    await screen.findByText("Aristotle");
    // The author's name is already in the adjacent heading, so without
    // distinct alt text the portrait is decorative and must use `alt=""`.
    // Re-using the author's name here would make screen readers announce
    // it twice. (`alt=""` makes the img role-presentation, which Testing
    // Library's role queries hide, so we read it from the DOM directly.)
    const img = await waitFor(() => {
      const el = container.querySelector<HTMLImageElement>(
        ".author-portrait-img"
      );
      if (!el) throw new Error("portrait image not yet rendered");
      return el;
    });
    expect(img.getAttribute("src")).toBe("https://example.test/portrait.jpg");
    expect(img.getAttribute("alt")).toBe("");
    // And nothing in the page falls back to announcing the author's name as
    // an image label.
    expect(screen.queryByAltText("Aristotle")).not.toBeInTheDocument();
  });

  // Regression: the API stores life dates as signed ISO strings
  // (`-0383-01-01T00:00:00.000Z`). `new Date(...)` returns `Invalid Date`
  // for that 4-digit signed-year shape in V8, so an earlier formatter
  // fell through to the raw ISO string for any pre-modern author. Parse
  // the year directly from the API string and render BCE years as
  // "<n> BC".
  it("renders a BCE lifespan as readable years rather than raw ISO strings", async () => {
    getAuthorMock.mockResolvedValue(
      author({
        born_date: "-0383-01-01T00:00:00.000Z",
        died_date: "-0321-01-01T00:00:00.000Z",
      })
    );

    renderAt("/quotes/q-1");

    expect(await screen.findByText("383 BC – 321 BC")).toBeInTheDocument();
    // Make sure the raw ISO strings never make it to the page.
    expect(
      screen.queryByText(/-0383-01-01T00:00:00\.000Z/)
    ).not.toBeInTheDocument();
  });

  it("renders a modern CE lifespan as bare years", async () => {
    getAuthorMock.mockResolvedValue(
      author({
        born_date: "1844-10-15T00:00:00.000Z",
        died_date: "1900-08-25T00:00:00.000Z",
      })
    );

    renderAt("/quotes/q-1");

    expect(await screen.findByText("1844 – 1900")).toBeInTheDocument();
  });

  it("uses 'present' for a still-living author", async () => {
    getAuthorMock.mockResolvedValue(
      author({
        born_date: "1955-02-24T00:00:00.000Z",
        died_date: null,
      })
    );

    renderAt("/quotes/q-1");

    expect(await screen.findByText("1955 – present")).toBeInTheDocument();
  });

  it("uses the image's own alt_text when present", async () => {
    getAuthorMock.mockResolvedValue(author({ image_id: "img-portrait" }));
    getImageMock.mockResolvedValue(
      image({
        id: "img-portrait",
        url: "https://example.test/portrait.jpg",
        alt_text: "Bust of Aristotle, Roman copy",
      })
    );

    renderAt("/quotes/q-1");

    const img = await screen.findByAltText("Bust of Aristotle, Roman copy");
    expect(img).toHaveAttribute("src", "https://example.test/portrait.jpg");
  });

  it("falls back to author initials when the portrait lookup errors", async () => {
    getAuthorMock.mockResolvedValue(author({ image_id: "img-portrait" }));
    getImageMock.mockRejectedValue(
      new ApiError("portrait gone", 404, null)
    );

    renderAt("/quotes/q-1");

    await screen.findByText("Aristotle");
    // The author block stays intact: the rest of the page must not crash on
    // a missing portrait — only the avatar degrades to an initials chip.
    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
    // The image element must not be rendered when the lookup failed.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the not-found state when the quote is missing", async () => {
    getQuoteMock.mockRejectedValue(new ApiError("gone", 404, null));

    renderAt("/quotes/q-missing");

    expect(
      await screen.findByRole("heading", { name: /Quote not found/i })
    ).toBeInTheDocument();
    // Author/category lookups must not fire when there is no quote.
    expect(getAuthorMock).not.toHaveBeenCalled();
    expect(getCategoryMock).not.toHaveBeenCalled();
  });

  it("surfaces non-404 quote errors as an alert", async () => {
    getQuoteMock.mockRejectedValue(new ApiError("boom", 500, null));

    renderAt("/quotes/q-1");

    // Multiple alert regions exist (inline error + toast errors region); the
    // inline page error is the one that carries the message verbatim.
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.some((el) => el.textContent === "boom")).toBe(true);
    });
  });

  it("falls back to a stable error line when the author lookup fails", async () => {
    getAuthorMock.mockRejectedValue(new ApiError("gone", 404, null));

    renderAt("/quotes/q-1");

    await screen.findByText("On Virtue");
    await waitFor(() => {
      expect(screen.getByText(/Could not load author/i)).toBeInTheDocument();
    });
    // The opaque author id is still surfaced so the user can report it.
    expect(screen.getByText("a-1")).toBeInTheDocument();
  });

  it("renders tag chips when the quote has tags", async () => {
    listQuoteTagsMock.mockResolvedValue([
      { id: "t-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
      { id: "t-2", name: "habit", created_at: "2020-01-01T00:00:00.000Z" },
    ]);

    renderAt("/quotes/q-1");

    await screen.findByText("On Virtue");
    const wisdom = await screen.findByText("wisdom");
    expect(wisdom).toBeInTheDocument();
    expect(screen.getByText("habit")).toBeInTheDocument();
  });

  it("deletes the quote on confirm and navigates back to the list", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => true);
    const user = userEvent.setup();

    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    await user.click(screen.getByRole("button", { name: /Delete/i }));

    await waitFor(() => {
      expect(deleteQuoteMock).toHaveBeenCalledWith("q-1");
    });
    expect(
      await screen.findByText("quotes-list-stub")
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("does not delete when the user cancels the confirm dialog", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockImplementation(() => false);
    const user = userEvent.setup();

    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    await user.click(screen.getByRole("button", { name: /Delete/i }));

    expect(deleteQuoteMock).not.toHaveBeenCalled();
    // Still on the detail page.
    expect(screen.getByText("On Virtue")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("offers a back-to-list breadcrumb", async () => {
    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    // Multiple links may say "All quotes" (breadcrumb + not-found page); on a
    // successful render only the breadcrumb is mounted.
    const breadcrumb = screen.getAllByRole("link", { name: /All quotes/i });
    expect(breadcrumb[0]).toHaveAttribute("href", "/quotes");
  });

  it("renders an Edit link that points to the quotes list", async () => {
    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");
    // Edit lives on the list page for now — see PLAN Phase B.1.
    const link = screen.getByRole("link", { name: /Edit On Virtue/i });
    expect(link).toHaveAttribute("href", "/quotes");
  });

  it("paints the author from the shared cache before the network responds", async () => {
    // The QuoteDetailPage and HomePage share `["author", id]` so seeded data
    // is visible on first render. We deliberately do not assert that the
    // network is never called: React Query's default `staleTime: 0` will
    // still revalidate in the background, which is correct stale-while-
    // revalidate behavior and not something this page should override.
    const client = makeClient();
    client.setQueryData(["author", "a-1"], author({ name: "Cached Author" }));
    // Make the network response distinguishable so we can prove the cached
    // value paints before the resolved one arrives.
    let resolveAuthor!: (value: unknown) => void;
    getAuthorMock.mockReturnValue(
      new Promise((resolve) => {
        resolveAuthor = resolve;
      })
    );

    renderAt("/quotes/q-1", client);

    await screen.findByText("On Virtue");
    expect(screen.getByText("Cached Author")).toBeInTheDocument();

    resolveAuthor(author({ name: "Refetched Author" }));
    await waitFor(() => {
      expect(screen.getByText("Refetched Author")).toBeInTheDocument();
    });
  });

  it("renders the category as a chip and the tags inside the meta block", async () => {
    listQuoteTagsMock.mockResolvedValue([
      { id: "t-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
    ]);
    getQuoteMock.mockResolvedValue(quote({ category_id: "c-1" }));

    renderAt("/quotes/q-1");

    await screen.findByText("On Virtue");
    // The chip renders the resolved category name, not the opaque id.
    expect(await screen.findByText("Ethics")).toBeInTheDocument();
    // Tags render within the same dl, alongside Created/Updated metadata.
    const tagRow = (await screen.findByText("wisdom")).closest(".meta-row");
    expect(tagRow).not.toBeNull();
    expect(within(tagRow as HTMLElement).getByText(/^Tags$/)).toBeInTheDocument();
  });

  // Phase B.1b: deep links from the detail page back into the list. The
  // links exercise the URL-as-source-of-truth contract that QuotesPage now
  // honors (PR #20), so a click takes the user straight to a filtered list
  // without any hydration glue.
  it("renders a 'view all quotes by this author' deep link pointing at /quotes?author_id=…", async () => {
    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    // The link is announced with the author's name so its purpose is
    // unambiguous out of context (screen-reader rotor view, search-by-link).
    const link = await screen.findByRole("link", {
      name: /View all quotes by Aristotle/i,
    });
    // The URL points at the list with only `author_id` set — no stale
    // filters from the current view leak into the deep link.
    expect(link).toHaveAttribute("href", "/quotes?author_id=a-1");
  });

  it("does not render the author deep link while the author query is pending", async () => {
    // Hold the author query in flight so we can observe the pending state.
    let resolveAuthor!: (value: ReturnType<typeof author>) => void;
    getAuthorMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof author>>((r) => {
          resolveAuthor = r;
        })
    );

    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    // The pending author block shows a skeleton; we have no human-readable
    // name yet, so we deliberately don't render a deep link with a generic
    // "this author" label that would be useless to a screen-reader user
    // navigating by links alone.
    expect(
      screen.queryByRole("link", { name: /quotes by/i })
    ).not.toBeInTheDocument();

    resolveAuthor(author());
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /View all quotes by Aristotle/i })
      ).toBeInTheDocument();
    });
  });

  it("does not render the author deep link when the author lookup fails", async () => {
    getAuthorMock.mockRejectedValue(new ApiError("gone", 404, null));

    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");
    await screen.findByText(/Could not load author/i);

    // We hide the deep link in the error state because we don't have the
    // human-readable name and a generic "this author" label is misleading
    // when we can't even confirm the author still exists.
    expect(
      screen.queryByRole("link", { name: /quotes by/i })
    ).not.toBeInTheDocument();
  });

  it("renders each tag chip as a deep link to /quotes?tag_id=…", async () => {
    listQuoteTagsMock.mockResolvedValue([
      { id: "t-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
      { id: "t-2", name: "habit", created_at: "2020-01-01T00:00:00.000Z" },
    ]);

    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    // Each chip is now a link, announced with its full purpose so a user
    // navigating by links alone can tell what each chip does.
    const wisdomLink = await screen.findByRole("link", {
      name: /View all quotes tagged "wisdom"/i,
    });
    expect(wisdomLink).toHaveAttribute("href", "/quotes?tag_id=t-1");

    const habitLink = screen.getByRole("link", {
      name: /View all quotes tagged "habit"/i,
    });
    expect(habitLink).toHaveAttribute("href", "/quotes?tag_id=t-2");

    // The visible chip text remains the bare tag name — no extra glyphs or
    // ARIA-only-labels swallowed by sighted users.
    expect(wisdomLink).toHaveTextContent(/^wisdom$/);
  });

  it("encodes special characters when building tag and author deep links", async () => {
    // Defense in depth: the API contract treats ids as opaque strings, so
    // any future id scheme that includes characters with reserved meaning
    // in URL query strings (`&`, `=`, ` `, …) must round-trip through
    // `encodeURIComponent` rather than landing in the href as a literal.
    // Without this guard, an id like `a&b=c` would silently inject a
    // second filter into the deep link and the destination list would
    // come up with the wrong rows.
    getQuoteMock.mockResolvedValue(quote({ author_id: "a&b=c" }));
    getAuthorMock.mockResolvedValue(
      author({ id: "a&b=c", name: "A & B = C" })
    );
    listQuoteTagsMock.mockResolvedValue([
      { id: "t 1/2", name: "with space", created_at: "2020-01-01T00:00:00.000Z" },
    ]);

    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    const authorLink = await screen.findByRole("link", {
      name: /View all quotes by A & B = C/i,
    });
    expect(authorLink).toHaveAttribute(
      "href",
      "/quotes?author_id=a%26b%3Dc"
    );

    const tagLink = await screen.findByRole("link", {
      name: /View all quotes tagged "with space"/i,
    });
    expect(tagLink).toHaveAttribute("href", "/quotes?tag_id=t+1%2F2");
  });

  it("navigates to the filtered list when a tag chip is clicked", async () => {
    // End-to-end proof that the deep link plays nicely with the list-page
    // route stub: the renderAt helper mounts a `/quotes` route alongside
    // the detail page, so clicking the tag chip should land us there.
    listQuoteTagsMock.mockResolvedValue([
      { id: "t-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
    ]);
    const user = userEvent.setup();

    renderAt("/quotes/q-1");
    await screen.findByText("On Virtue");

    await user.click(
      await screen.findByRole("link", {
        name: /View all quotes tagged "wisdom"/i,
      })
    );

    expect(
      await screen.findByText("quotes-list-stub")
    ).toBeInTheDocument();
  });
});
