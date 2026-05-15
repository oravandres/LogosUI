import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { ToastProvider } from "@/components/ToastProvider";
import { AuthorsPage } from "./AuthorsPage";

const listAuthorsMock = vi.fn();
const createAuthorMock = vi.fn();
const updateAuthorMock = vi.fn();
const deleteAuthorMock = vi.fn();
const listAllCategoriesByTypeMock = vi.fn();
const listImagesMock = vi.fn();
const getImageMock = vi.fn();

vi.mock("@/api/authors", () => ({
  AUTHORS_PAGE_SIZE: 20,
  listAuthors: (...args: unknown[]) => listAuthorsMock(...args),
  createAuthor: (...args: unknown[]) => createAuthorMock(...args),
  updateAuthor: (...args: unknown[]) => updateAuthorMock(...args),
  deleteAuthor: (...args: unknown[]) => deleteAuthorMock(...args),
}));

vi.mock("@/api/categories", () => ({
  listAllCategoriesByType: (...args: unknown[]) =>
    listAllCategoriesByTypeMock(...args),
}));

vi.mock("@/api/images", () => ({
  listImages: (...args: unknown[]) => listImagesMock(...args),
  getImage: (...args: unknown[]) => getImageMock(...args),
}));

function renderPage(initialEntry: string = "/authors") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  // Capture the live URL via a sibling component so tests can assert what
  // `useSearchParams` mirrored into the address bar without standing up a
  // full RouterProvider. The hidden "navigate to" button lets tests
  // trigger a programmatic search-only navigation (back/forward, sidebar
  // link, etc.) and assert that the page reacts to URL changes while it
  // stays mounted.
  let currentSearch = "";
  function TestHarness() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    currentSearch = params.toString();
    return (
      <button
        type="button"
        data-testid="external-navigate"
        onClick={(ev) => {
          const target = ev.currentTarget.dataset.target ?? "";
          navigate(target);
        }}
      >
        navigate
      </button>
    );
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthorsPage />
          <TestHarness />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return {
    ...utils,
    getCurrentSearch: () => currentSearch,
    /** Simulates a search-only navigation while AuthorsPage stays mounted. */
    navigateTo: async (target: string) => {
      const btn = utils.getByTestId("external-navigate") as HTMLButtonElement;
      btn.dataset.target = target;
      btn.click();
    },
  };
}

function sampleAuthor() {
  return {
    id: "auth-1",
    name: "Aristotle",
    bio: null,
    born_date: null,
    died_date: null,
    image_id: null,
    category_id: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
  };
}

describe("AuthorsPage inline edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAuthorsMock.mockResolvedValue({
      items: [sampleAuthor()],
      total: 1,
      offset: 0,
      limit: 20,
    });
    listAllCategoriesByTypeMock.mockResolvedValue([]);
    listImagesMock.mockResolvedValue({
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
    });
    getImageMock.mockResolvedValue(null);
    createAuthorMock.mockResolvedValue(sampleAuthor());
    deleteAuthorMock.mockResolvedValue(undefined);
    updateAuthorMock.mockResolvedValue({ ...sampleAuthor(), name: "Plato" });
  });

  it("shows client-side validation when name is empty on save", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Aristotle");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByRole("textbox", { name: /name — aristotle/i });
    await user.clear(nameField);
    await user.click(
      screen.getByRole("button", { name: /save changes for author aristotle/i })
    );
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(updateAuthorMock).not.toHaveBeenCalled();
  });

  it("validates died date must not precede born date", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Aristotle");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const born = screen.getByLabelText(/born — aristotle/i) as HTMLInputElement;
    const died = screen.getByLabelText(/died — aristotle/i) as HTMLInputElement;
    await user.type(born, "2020-06-01");
    await user.type(died, "2020-01-01");
    await user.click(
      screen.getByRole("button", { name: /save changes for author aristotle/i })
    );
    expect(
      screen.getByText("Died date must not be earlier than born date.")
    ).toBeInTheDocument();
    expect(updateAuthorMock).not.toHaveBeenCalled();
  });

  it("submits update on save success", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Aristotle");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByRole("textbox", { name: /name — aristotle/i });
    await user.clear(nameField);
    await user.type(nameField, "Plato");
    await user.click(
      screen.getByRole("button", { name: /save changes for author aristotle/i })
    );
    await waitFor(() =>
      expect(updateAuthorMock).toHaveBeenCalledWith("auth-1", {
        name: "Plato",
        bio: null,
        born_date: null,
        died_date: null,
        image_id: null,
        category_id: null,
      })
    );
  });

  it("surfaces server errors from update", async () => {
    updateAuthorMock.mockRejectedValueOnce(
      new ApiError("Author is locked", 500, {})
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Aristotle");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByRole("textbox", { name: /name — aristotle/i });
    await user.clear(nameField);
    await user.type(nameField, "Plato");
    await user.click(
      screen.getByRole("button", { name: /save changes for author aristotle/i })
    );
    await screen.findByText("Author is locked");
    expect(updateAuthorMock).toHaveBeenCalled();
  });
});

describe("AuthorsPage URL search params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAuthorsMock.mockResolvedValue({
      items: [sampleAuthor()],
      total: 1,
      offset: 0,
      limit: 20,
    });
    listAllCategoriesByTypeMock.mockResolvedValue([
      {
        id: "cat-1",
        name: "Philosophy",
        type: "author",
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
      },
    ]);
    listImagesMock.mockResolvedValue({
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
    });
    getImageMock.mockResolvedValue(null);
  });

  it("hydrates filter state from the URL on mount and forwards them to listAuthors", async () => {
    renderPage("/authors?category_id=cat-1&name=arist&offset=20");

    // First listAuthors call must already carry every URL-derived filter
    // so the user lands on exactly the page they shared / linked.
    await waitFor(() => {
      expect(listAuthorsMock).toHaveBeenCalled();
      const firstCall = listAuthorsMock.mock.calls[0]?.[0];
      expect(firstCall).toEqual(
        expect.objectContaining({
          categoryId: "cat-1",
          name: "arist",
          offset: 20,
        })
      );
    });

    // Visible UI should also reflect the hydrated state so the user can
    // read the active filter without inspecting the URL.
    const searchBox = await screen.findByRole("searchbox", {
      name: /^search name$/i,
    });
    expect((searchBox as HTMLInputElement).value).toBe("arist");
  });

  it("clamps a negative ?offset back to 0 (defense against tampered links)", async () => {
    renderPage("/authors?offset=-1");

    await waitFor(() => {
      expect(listAuthorsMock).toHaveBeenCalled();
      const firstCall = listAuthorsMock.mock.calls[0]?.[0];
      expect(firstCall).toEqual(expect.objectContaining({ offset: 0 }));
    });
  });

  it.each(["20foo", "3.14", "1e2", "+5"])(
    "rejects partially numeric ?offset value %s and clamps to 0",
    async (bad) => {
      renderPage(`/authors?offset=${bad}`);
      await waitFor(() => {
        expect(listAuthorsMock).toHaveBeenCalled();
        const firstCall = listAuthorsMock.mock.calls[0]?.[0];
        expect(firstCall).toEqual(expect.objectContaining({ offset: 0 }));
      });
    }
  );

  it("mirrors filter changes into the URL via replaceState (no history spam, no empty-string params)", async () => {
    const user = userEvent.setup();
    const { getCurrentSearch } = renderPage();
    await screen.findByText("Aristotle");

    // Pristine URL: nothing to mirror until the user touches a filter.
    await waitFor(() => expect(getCurrentSearch()).toBe(""));

    const categoryFilter = screen.getByRole("combobox", {
      name: /filter by category/i,
    });
    await user.selectOptions(categoryFilter, "cat-1");

    await waitFor(() =>
      expect(getCurrentSearch()).toContain("category_id=cat-1")
    );
    // Sanity: only the touched filter ends up on the URL — empty values
    // must not serialize as `&name=&offset=`.
    expect(getCurrentSearch()).not.toMatch(/(^|&)name=/);
    expect(getCurrentSearch()).not.toMatch(/(^|&)offset=/);
  });

  it("clearing all filters strips every param off the URL", async () => {
    const user = userEvent.setup();
    const { getCurrentSearch } = renderPage(
      "/authors?category_id=cat-1&name=foo&offset=20"
    );
    await screen.findByText("Aristotle");
    await waitFor(() =>
      expect(getCurrentSearch()).toContain("category_id=cat-1")
    );

    // Filter-aware empty-state path: when the result set is empty under
    // an active filter, the page renders a "Clear filters" button.
    listAuthorsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
      offset: 20,
      limit: 20,
    });
    // Toggle the category filter to force a refetch with the new state.
    const categoryFilter = screen.getByRole("combobox", {
      name: /filter by category/i,
    });
    await user.selectOptions(categoryFilter, "");

    // Now the URL has only `name` (and offset was dropped on filter
    // change). Trigger another empty result so the "Clear filters" CTA
    // surfaces.
    listAuthorsMock.mockResolvedValue({
      items: [],
      total: 0,
      offset: 0,
      limit: 20,
    });
    const clearBtn = await screen.findByRole("button", {
      name: /clear filters/i,
    });
    await user.click(clearBtn);

    await waitFor(() => expect(getCurrentSearch()).toBe(""));
  });

  it("debounced search-box commits ?name onto the URL and threads name into listAuthors", async () => {
    const user = userEvent.setup();
    const { getCurrentSearch } = renderPage();
    await screen.findByText("Aristotle");
    await waitFor(() => expect(getCurrentSearch()).toBe(""));

    const searchBox = await screen.findByRole("searchbox", {
      name: /^search name$/i,
    });
    listAuthorsMock.mockClear();
    await user.type(searchBox, "arist");

    // Debounce window is 400ms; wait generously past it.
    await waitFor(
      () => expect(getCurrentSearch()).toContain("name=arist"),
      { timeout: 2000 }
    );

    await waitFor(() => {
      const lastCall =
        listAuthorsMock.mock.calls[listAuthorsMock.mock.calls.length - 1]?.[0];
      expect(lastCall).toEqual(
        expect.objectContaining({ name: "arist" })
      );
    });
  });

  it("reacts to search-only navigation (back/forward, sidebar link) while staying mounted", async () => {
    const { navigateTo } = renderPage("/authors?category_id=cat-1");
    await waitFor(() => {
      expect(listAuthorsMock).toHaveBeenCalled();
      expect(listAuthorsMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ categoryId: "cat-1" })
      );
    });

    // Programmatic navigation to a different query string — same
    // component instance, no remount. The list query must refire with
    // the new filters (this is the regression: previously the
    // `useState` initializers only ran once, so the URL changed
    // silently and the list kept the old filters).
    listAuthorsMock.mockClear();
    await navigateTo("/authors?offset=20");

    await waitFor(() => {
      expect(listAuthorsMock).toHaveBeenCalled();
      const lastCall =
        listAuthorsMock.mock.calls[listAuthorsMock.mock.calls.length - 1]?.[0];
      expect(lastCall).toEqual(
        expect.objectContaining({ categoryId: "", offset: 20 })
      );
    });
  });

  it("syncs the editable search-box draft when ?name changes externally", async () => {
    const { navigateTo } = renderPage("/authors?name=arist");
    const searchBox = await screen.findByRole("searchbox", {
      name: /^search name$/i,
    });
    expect((searchBox as HTMLInputElement).value).toBe("arist");

    await navigateTo("/authors?name=plato");

    await waitFor(() =>
      expect((searchBox as HTMLInputElement).value).toBe("plato")
    );
  });

  it("does not let an uncommitted search-box draft leak across an external navigation that keeps ?name unchanged", async () => {
    // Regression for the debounce/navigation race documented in
    // .cursor/rules/12-pr-review-lessons.mdc and fixed for QuotesPage in
    // commit 7e62017:
    //   1. User types `pl` into the search box on /authors (no ?name).
    //   2. Before the debounce fires they click a sidebar deep link
    //      whose ?name value is also missing.
    //   3. Old behavior: the resync effect was gated on the committed
    //      value, so an unchanged committed value left the stale draft
    //      alive and the pending timer later appended `?name=pl` onto
    //      the freshly navigated URL — the draft leaked across the
    //      navigation.
    //
    // The fix snaps `searchInput` on any external search-param change,
    // which (a) updates the visible input and (b) cancels the pending
    // debounce via the [searchInput] effect cleanup.
    const user = userEvent.setup();
    const { navigateTo, getCurrentSearch } = renderPage("/authors");
    await screen.findByText("Aristotle");
    await waitFor(() => expect(getCurrentSearch()).toBe(""));

    const searchBox = await screen.findByRole("searchbox", {
      name: /^search name$/i,
    });
    await user.type(searchBox, "pl");
    expect((searchBox as HTMLInputElement).value).toBe("pl");
    // Pre-debounce: ?name hasn't been committed yet.
    expect(getCurrentSearch()).not.toMatch(/(^|&)name=/);

    // External navigation while the debounce is still in flight; the
    // destination keeps `?name` absent.
    await navigateTo("/authors?category_id=cat-1");

    // Wait past the debounce window (SEARCH_DEBOUNCE_MS = 400ms) plus
    // generous slack. If the leak is back, the pending timer would
    // commit `?name=pl` onto the new URL during this wait.
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(getCurrentSearch()).toContain("category_id=cat-1");
    expect(getCurrentSearch()).not.toMatch(/(^|&)name=/);
    // The search box also catches up to the destination URL's value
    // (empty) so the user is not left looking at their stale draft.
    expect((searchBox as HTMLInputElement).value).toBe("");
  });
});
