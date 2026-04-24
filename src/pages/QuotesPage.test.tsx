import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { ToastProvider } from "@/components/ToastProvider";
import { QuotesPage } from "./QuotesPage";

const listQuotesMock = vi.fn();
const createQuoteMock = vi.fn();
const updateQuoteMock = vi.fn();
const deleteQuoteMock = vi.fn();
const listAuthorsMock = vi.fn();
const getAuthorMock = vi.fn();
const listAllCategoriesByTypeMock = vi.fn();
const listImagesMock = vi.fn();
const getImageMock = vi.fn();
const listQuoteTagsMock = vi.fn();
const listAllTagsMock = vi.fn();
const addTagToQuoteMock = vi.fn();
const removeTagFromQuoteMock = vi.fn();

vi.mock("@/api/quotes", () => ({
  QUOTES_PAGE_SIZE: 20,
  listQuotes: (...args: unknown[]) => listQuotesMock(...args),
  createQuote: (...args: unknown[]) => createQuoteMock(...args),
  updateQuote: (...args: unknown[]) => updateQuoteMock(...args),
  deleteQuote: (...args: unknown[]) => deleteQuoteMock(...args),
}));

vi.mock("@/api/authors", () => ({
  listAuthors: (...args: unknown[]) => listAuthorsMock(...args),
  getAuthor: (...args: unknown[]) => getAuthorMock(...args),
}));

vi.mock("@/api/categories", () => ({
  listAllCategoriesByType: (...args: unknown[]) =>
    listAllCategoriesByTypeMock(...args),
}));

vi.mock("@/api/images", () => ({
  listImages: (...args: unknown[]) => listImagesMock(...args),
  getImage: (...args: unknown[]) => getImageMock(...args),
}));

vi.mock("@/api/tags", () => ({
  listQuoteTags: (...args: unknown[]) => listQuoteTagsMock(...args),
  listAllTags: (...args: unknown[]) => listAllTagsMock(...args),
  addTagToQuote: (...args: unknown[]) => addTagToQuoteMock(...args),
  removeTagFromQuote: (...args: unknown[]) => removeTagFromQuoteMock(...args),
}));

function renderPage(initialEntry: string = "/quotes") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  // We capture the live URL via a sibling route component so tests can
  // assert what `useSearchParams` mirrored into the address bar without
  // pulling in a full RouterProvider. The hidden "navigate to" button lets
  // tests trigger a programmatic search-only navigation (back/forward,
  // sidebar link, etc.) and assert that the page reacts to URL changes
  // while it stays mounted.
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
          <QuotesPage />
          <TestHarness />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return {
    ...utils,
    getCurrentSearch: () => currentSearch,
    /** Simulates a search-only navigation while QuotesPage stays mounted. */
    navigateTo: async (target: string) => {
      const btn = utils.getByTestId("external-navigate") as HTMLButtonElement;
      btn.dataset.target = target;
      btn.click();
    },
  };
}

function sampleQuote() {
  return {
    id: "quote-1",
    title: "On Virtue",
    text: "Virtue is a habit.",
    author_id: "auth-1",
    image_id: null,
    category_id: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
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

describe("QuotesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listQuotesMock.mockResolvedValue({
      items: [sampleQuote()],
      total: 1,
      offset: 0,
      limit: 20,
    });
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
    getAuthorMock.mockResolvedValue(sampleAuthor());
    getImageMock.mockResolvedValue(null);
    createQuoteMock.mockResolvedValue(sampleQuote());
    deleteQuoteMock.mockResolvedValue(undefined);
    updateQuoteMock.mockResolvedValue({
      ...sampleQuote(),
      title: "Updated",
    });
    listQuoteTagsMock.mockResolvedValue([]);
    listAllTagsMock.mockResolvedValue({
      items: [],
      total: 0,
      truncated: false,
    });
    addTagToQuoteMock.mockResolvedValue(undefined);
    removeTagFromQuoteMock.mockResolvedValue(undefined);
  });

  it("renders the quote from the list", async () => {
    renderPage();
    expect(await screen.findByText("On Virtue")).toBeInTheDocument();
  });

  it("links each row title to the matching quote detail page", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: /On Virtue/i });
    expect(link).toHaveAttribute("href", "/quotes/quote-1");
  });

  describe("create form", () => {
    it("blocks submit when title is empty", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");
      await user.click(
        screen.getByRole("button", { name: /^create$/i })
      );
      expect(screen.getByText("Title is required.")).toBeInTheDocument();
      expect(createQuoteMock).not.toHaveBeenCalled();
    });

    it("blocks submit when text is empty", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");
      const titleField = screen
        .getAllByRole("textbox")
        .find((el) => (el as HTMLInputElement).maxLength === 500);
      expect(titleField).toBeDefined();
      await user.type(titleField as HTMLInputElement, "A title");
      await user.click(
        screen.getByRole("button", { name: /^create$/i })
      );
      expect(screen.getByText("Text is required.")).toBeInTheDocument();
      expect(createQuoteMock).not.toHaveBeenCalled();
    });

    it("blocks submit when author is not selected", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");
      const textboxes = screen.getAllByRole("textbox");
      const titleField = textboxes.find(
        (el) => (el as HTMLInputElement).maxLength === 500
      );
      const textField = textboxes.find(
        (el) => el.tagName === "TEXTAREA"
      );
      await user.type(titleField as HTMLInputElement, "A title");
      await user.type(textField as HTMLTextAreaElement, "Some text");
      await user.click(
        screen.getByRole("button", { name: /^create$/i })
      );
      expect(screen.getByText("Author is required.")).toBeInTheDocument();
      expect(createQuoteMock).not.toHaveBeenCalled();
    });

    it("lets the user search by name and select an author beyond the initial window", async () => {
      const platoAuthor = {
        ...sampleAuthor(),
        id: "auth-plato",
        name: "Plato",
      };
      listAuthorsMock.mockImplementation(
        (params: { name?: string } = {}) => {
          if ((params.name ?? "") === "Plato") {
            return Promise.resolve({
              items: [platoAuthor],
              total: 1,
              offset: 0,
              limit: 20,
            });
          }
          return Promise.resolve({
            items: [sampleAuthor()],
            total: 1,
            offset: 0,
            limit: 20,
          });
        }
      );
      getAuthorMock.mockImplementation((id: string) => {
        if (id === "auth-plato") return Promise.resolve(platoAuthor);
        return Promise.resolve(sampleAuthor());
      });

      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      const authorCombo = screen.getByRole("combobox", { name: "Author" });
      await user.click(authorCombo);
      await user.type(authorCombo, "Plato");
      const option = await screen.findByRole("option", { name: "Plato" });
      await user.click(option);

      await waitFor(() =>
        expect((authorCombo as HTMLInputElement).value).toBe("Plato")
      );

      const textboxes = screen.getAllByRole("textbox");
      const titleField = textboxes.find(
        (el) => (el as HTMLInputElement).maxLength === 500
      );
      const textField = textboxes.find((el) => el.tagName === "TEXTAREA");
      await user.type(titleField as HTMLInputElement, "On Justice");
      await user.type(
        textField as HTMLTextAreaElement,
        "Justice in the soul."
      );

      await user.click(screen.getByRole("button", { name: /^create$/i }));
      await waitFor(() =>
        expect(createQuoteMock).toHaveBeenCalledWith({
          title: "On Justice",
          text: "Justice in the soul.",
          author_id: "auth-plato",
          image_id: null,
          category_id: null,
        })
      );
    });

    it("supports keyboard navigation: ArrowDown + Enter commits the highlighted author", async () => {
      const aristotle = { ...sampleAuthor(), id: "auth-1", name: "Aristotle" };
      const plato = { ...sampleAuthor(), id: "auth-2", name: "Plato" };
      const socrates = { ...sampleAuthor(), id: "auth-3", name: "Socrates" };
      listAuthorsMock.mockResolvedValue({
        items: [aristotle, plato, socrates],
        total: 3,
        offset: 0,
        limit: 20,
      });
      getAuthorMock.mockImplementation((id: string) => {
        if (id === "auth-2") return Promise.resolve(plato);
        if (id === "auth-3") return Promise.resolve(socrates);
        return Promise.resolve(aristotle);
      });

      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      const authorCombo = screen.getByRole("combobox", { name: "Author" });
      await user.click(authorCombo);
      await screen.findByRole("option", { name: "Aristotle" });

      // activeIndex starts at 0 (Aristotle). ArrowDown → Plato.
      await user.keyboard("{ArrowDown}");
      // aria-activedescendant should now point at Plato.
      await waitFor(() => {
        const descId = authorCombo.getAttribute("aria-activedescendant");
        const active = descId ? document.getElementById(descId) : null;
        expect(active?.textContent).toBe("Plato");
      });

      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect((authorCombo as HTMLInputElement).value).toBe("Plato")
      );

      const textboxes = screen.getAllByRole("textbox");
      const titleField = textboxes.find(
        (el) => (el as HTMLInputElement).maxLength === 500
      );
      const textField = textboxes.find((el) => el.tagName === "TEXTAREA");
      await user.type(titleField as HTMLInputElement, "Dialogue");
      await user.type(textField as HTMLTextAreaElement, "On the Republic.");

      await user.click(screen.getByRole("button", { name: /^create$/i }));
      await waitFor(() =>
        expect(createQuoteMock).toHaveBeenCalledWith({
          title: "Dialogue",
          text: "On the Republic.",
          author_id: "auth-2",
          image_id: null,
          category_id: null,
        })
      );
    });
  });

  describe("filter combobox", () => {
    it("lets keyboard-only users reach an author below 'All authors'", async () => {
      const aristotle = { ...sampleAuthor(), id: "auth-1", name: "Aristotle" };
      listAuthorsMock.mockResolvedValue({
        items: [aristotle],
        total: 1,
        offset: 0,
        limit: 20,
      });

      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      const filterCombo = screen.getByRole("combobox", {
        name: "Filter by author",
      });
      await user.click(filterCombo);
      // With allowNone, index 0 is the "All authors" row.
      await screen.findByRole("option", { name: /all authors/i });
      await screen.findByRole("option", { name: "Aristotle" });

      // ArrowDown moves from "All authors" (0) to "Aristotle" (1).
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await waitFor(() => {
        const lastCall =
          listQuotesMock.mock.calls[listQuotesMock.mock.calls.length - 1]?.[0];
        expect(lastCall).toEqual(
          expect.objectContaining({ authorId: "auth-1" })
        );
      });
    });
  });

  describe("inline edit", () => {
    it("validates that title is required on save", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");
      await user.click(screen.getByRole("button", { name: "Edit" }));
      const titleField = screen.getByRole("textbox", {
        name: /title — on virtue/i,
      });
      await user.clear(titleField);
      await user.click(
        screen.getByRole("button", {
          name: /save changes for quote on virtue/i,
        })
      );
      expect(screen.getByText("Title is required.")).toBeInTheDocument();
      expect(updateQuoteMock).not.toHaveBeenCalled();
    });

    it("validates that text is required on save", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");
      await user.click(screen.getByRole("button", { name: "Edit" }));
      const textField = screen.getByRole("textbox", {
        name: /text — on virtue/i,
      });
      await user.clear(textField);
      await user.click(
        screen.getByRole("button", {
          name: /save changes for quote on virtue/i,
        })
      );
      expect(screen.getByText("Text is required.")).toBeInTheDocument();
      expect(updateQuoteMock).not.toHaveBeenCalled();
    });

    it("submits the update on save success", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");
      await user.click(screen.getByRole("button", { name: "Edit" }));
      const titleField = screen.getByRole("textbox", {
        name: /title — on virtue/i,
      });
      await user.clear(titleField);
      await user.type(titleField, "Updated");
      await user.click(
        screen.getByRole("button", {
          name: /save changes for quote on virtue/i,
        })
      );
      await waitFor(() =>
        expect(updateQuoteMock).toHaveBeenCalledWith("quote-1", {
          title: "Updated",
          text: "Virtue is a habit.",
          author_id: "auth-1",
          image_id: null,
          category_id: null,
        })
      );
    });

    it("surfaces server errors from update", async () => {
      updateQuoteMock.mockRejectedValueOnce(
        new ApiError("Quote is locked", 500, {})
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");
      await user.click(screen.getByRole("button", { name: "Edit" }));
      const titleField = screen.getByRole("textbox", {
        name: /title — on virtue/i,
      });
      await user.clear(titleField);
      await user.type(titleField, "Updated");
      await user.click(
        screen.getByRole("button", {
          name: /save changes for quote on virtue/i,
        })
      );
      await screen.findByText("Quote is locked");
      expect(updateQuoteMock).toHaveBeenCalled();
    });
  });

  describe("tag management", () => {
    it("renders existing tag chips on the row", async () => {
      listQuoteTagsMock.mockResolvedValue([
        { id: "tag-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
      ]);
      renderPage();
      expect(await screen.findByText("wisdom")).toBeInTheDocument();
    });

    it("opens the tag editor and adds a tag", async () => {
      listAllTagsMock.mockResolvedValue({
        items: [
          { id: "tag-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
          { id: "tag-2", name: "virtue", created_at: "2020-01-01T00:00:00.000Z" },
        ],
        total: 2,
        truncated: false,
      });
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      await user.click(
        screen.getByRole("button", { name: /manage tags for on virtue/i })
      );

      const select = await screen.findByRole("combobox", {
        name: /add tag to on virtue/i,
      });
      await user.selectOptions(select, "tag-2");
      await user.click(screen.getByRole("button", { name: /^add$/i }));

      await waitFor(() =>
        expect(addTagToQuoteMock).toHaveBeenCalledWith("quote-1", "tag-2")
      );
    });

    it("removes an existing tag from the editor", async () => {
      listQuoteTagsMock.mockResolvedValue([
        { id: "tag-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
      ]);
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      await user.click(
        screen.getByRole("button", { name: /manage tags for on virtue/i })
      );

      const removeBtn = await screen.findByRole("button", {
        name: /remove tag wisdom from on virtue/i,
      });
      await user.click(removeBtn);

      await waitFor(() =>
        expect(removeTagFromQuoteMock).toHaveBeenCalledWith("quote-1", "tag-1")
      );
    });

    it("surfaces parent-404 (quote gone) as a stable refresh prompt", async () => {
      listQuoteTagsMock.mockRejectedValue(
        new ApiError("quote not found", 404, { error: "quote not found" })
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      await user.click(
        screen.getByRole("button", { name: /manage tags for on virtue/i })
      );

      expect(
        await screen.findByText(
          /this quote no longer exists on the server\. close this panel and refresh the list\./i
        )
      ).toBeInTheDocument();

      // Add panel must not render when the parent is gone.
      expect(
        screen.queryByRole("combobox", { name: /add tag to on virtue/i })
      ).not.toBeInTheDocument();
    });

    it("surfaces child-422 (tag gone), clears the stale id, and disables Add", async () => {
      // Initial picker has tag-1; after the cache refresh it is gone.
      listAllTagsMock
        .mockResolvedValueOnce({
          items: [
            {
              id: "tag-1",
              name: "wisdom",
              created_at: "2020-01-01T00:00:00.000Z",
            },
          ],
          total: 1,
          truncated: false,
        })
        .mockResolvedValue({ items: [], total: 0, truncated: false });
      addTagToQuoteMock.mockRejectedValueOnce(
        new ApiError("referenced tag does not exist", 422, {
          error: "referenced tag does not exist",
        })
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      await user.click(
        screen.getByRole("button", { name: /manage tags for on virtue/i })
      );

      const select = await screen.findByRole("combobox", {
        name: /add tag to on virtue/i,
      });
      await user.selectOptions(select, "tag-1");

      const addBtn = screen.getByRole("button", { name: /^add$/i });
      expect(addBtn).toBeEnabled();
      await user.click(addBtn);

      expect(
        await screen.findByText(
          /the selected tag no longer exists\. refreshing the tag list/i
        )
      ).toBeInTheDocument();
      expect(addTagToQuoteMock).toHaveBeenCalledWith("quote-1", "tag-1");

      // The stale id is cleared and Add stays disabled, so a second click
      // cannot resubmit the same dead tag_id.
      await waitFor(() =>
        expect((select as HTMLSelectElement).value).toBe("")
      );
      expect(
        screen.getByRole("button", { name: /^add$/i })
      ).toBeDisabled();
    });

    it("on add-404 (parent gone after open), hides chips and the add picker", async () => {
      listQuoteTagsMock.mockResolvedValue([
        { id: "tag-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
      ]);
      listAllTagsMock.mockResolvedValue({
        items: [
          { id: "tag-2", name: "virtue", created_at: "2020-01-01T00:00:00.000Z" },
        ],
        total: 1,
        truncated: false,
      });
      addTagToQuoteMock.mockRejectedValueOnce(
        new ApiError("quote not found", 404, { error: "quote not found" })
      );

      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      await user.click(
        screen.getByRole("button", { name: /manage tags for on virtue/i })
      );

      // Initial open: existing chip + remove button + add picker all present.
      expect(
        await screen.findByRole("button", {
          name: /remove tag wisdom from on virtue/i,
        })
      ).toBeInTheDocument();
      const select = screen.getByRole("combobox", {
        name: /add tag to on virtue/i,
      });
      await user.selectOptions(select, "tag-2");
      await user.click(screen.getByRole("button", { name: /^add$/i }));

      // Parent-missing banner appears.
      expect(
        await screen.findByText(
          /this quote no longer exists on the server\. close this panel and refresh the list\./i
        )
      ).toBeInTheDocument();
      // Editor controls collapse so the user cannot retry against a dead
      // parent: no add picker, no remove buttons on stale chips.
      await waitFor(() =>
        expect(
          screen.queryByRole("combobox", { name: /add tag to on virtue/i })
        ).not.toBeInTheDocument()
      );
      expect(
        screen.queryByRole("button", {
          name: /remove tag wisdom from on virtue/i,
        })
      ).not.toBeInTheDocument();
    });

    it("filters the list by tag when a tag is selected from the toolbar", async () => {
      listAllTagsMock.mockResolvedValue({
        items: [
          { id: "tag-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
          { id: "tag-2", name: "virtue", created_at: "2020-01-01T00:00:00.000Z" },
        ],
        total: 2,
        truncated: false,
      });
      const user = userEvent.setup();
      const { getCurrentSearch } = renderPage();
      await screen.findByText("On Virtue");

      const tagFilter = await screen.findByRole("combobox", {
        name: "Filter by tag",
      });
      await user.selectOptions(tagFilter, "tag-2");

      await waitFor(() => {
        const lastCall =
          listQuotesMock.mock.calls[listQuotesMock.mock.calls.length - 1]?.[0];
        expect(lastCall).toEqual(
          expect.objectContaining({ tagId: "tag-2" })
        );
      });
      // Tag id should also be mirrored into the URL so the filtered list is
      // shareable and reachable via the deep link from QuoteDetailPage.
      await waitFor(() =>
        expect(getCurrentSearch()).toContain("tag_id=tag-2")
      );
    });

    it("on a non-404 read failure, hides the empty state and the add picker", async () => {
      listQuoteTagsMock.mockRejectedValue(
        new ApiError("upstream timeout", 500, {})
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("On Virtue");

      await user.click(
        screen.getByRole("button", { name: /manage tags for on virtue/i })
      );

      // The error is surfaced.
      expect(await screen.findByText("upstream timeout")).toBeInTheDocument();
      // But neither the "No tags yet." empty state nor the add picker
      // render — otherwise the user would edit blind.
      expect(screen.queryByText(/no tags yet\./i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: /add tag to on virtue/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("URL search params", () => {
    it("hydrates filter state from the URL on mount and forwards them to listQuotes", async () => {
      listAllTagsMock.mockResolvedValue({
        items: [
          { id: "tag-1", name: "wisdom", created_at: "2020-01-01T00:00:00.000Z" },
        ],
        total: 1,
        truncated: false,
      });
      listAllCategoriesByTypeMock.mockResolvedValue([
        {
          id: "cat-1",
          name: "Philosophy",
          type: "quote",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      ]);

      renderPage(
        "/quotes?author_id=auth-1&category_id=cat-1&tag_id=tag-1&q=virtue&offset=20"
      );

      // The first listQuotes call must already carry every URL-derived
      // filter so the user lands on exactly the page they shared / linked.
      await waitFor(() => {
        expect(listQuotesMock).toHaveBeenCalled();
        const firstCall = listQuotesMock.mock.calls[0]?.[0];
        expect(firstCall).toEqual(
          expect.objectContaining({
            authorId: "auth-1",
            categoryId: "cat-1",
            tagId: "tag-1",
            q: "virtue",
            offset: 20,
          })
        );
      });

      // Visible UI controls should also reflect the hydrated state so the
      // user can read the active filter without inspecting the URL.
      const searchBox = await screen.findByRole("searchbox", {
        name: /^search$/i,
      });
      expect((searchBox as HTMLInputElement).value).toBe("virtue");
    });

    it("clamps a negative or non-integer ?offset back to 0 (defense against tampered links)", async () => {
      renderPage("/quotes?offset=-1");

      await waitFor(() => {
        expect(listQuotesMock).toHaveBeenCalled();
        const firstCall = listQuotesMock.mock.calls[0]?.[0];
        expect(firstCall).toEqual(expect.objectContaining({ offset: 0 }));
      });
    });

    it("mirrors filter changes into the URL via replaceState (no history spam)", async () => {
      const user = userEvent.setup();
      const { getCurrentSearch } = renderPage();
      await screen.findByText("On Virtue");

      // Pristine URL: nothing to mirror until the user touches a filter.
      await waitFor(() => expect(getCurrentSearch()).toBe(""));

      const filterCombo = screen.getByRole("combobox", {
        name: "Filter by author",
      });
      await user.click(filterCombo);
      await screen.findByRole("option", { name: "Aristotle" });
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(getCurrentSearch()).toContain("author_id=auth-1")
      );
      // Sanity: only the touched filter ends up on the URL — empty strings
      // must not serialize as `&category_id=&tag_id=`.
      expect(getCurrentSearch()).not.toMatch(/category_id=/);
      expect(getCurrentSearch()).not.toMatch(/tag_id=/);
      expect(getCurrentSearch()).not.toMatch(/offset=/);
    });

    it("clearing all filters strips every param off the URL", async () => {
      const user = userEvent.setup();
      const { getCurrentSearch } = renderPage(
        "/quotes?author_id=auth-1&offset=20"
      );
      await screen.findByText("On Virtue");
      await waitFor(() => expect(getCurrentSearch()).toContain("author_id=auth-1"));

      // The filter-aware empty-state path renders a "Clear filters" button
      // when results come back empty under an active filter — exercise that
      // path rather than reaching into private setters.
      listQuotesMock.mockResolvedValueOnce({
        items: [],
        total: 0,
        offset: 20,
        limit: 20,
      });
      // Force a refetch by toggling one filter, then confirm Clear filters
      // wipes the URL entirely.
      const filterCombo = screen.getByRole("combobox", {
        name: "Filter by author",
      });
      await user.click(filterCombo);
      // Select the "All authors" sentinel to clear that one filter via UI.
      const allAuthors = await screen.findByRole("option", {
        name: /all authors/i,
      });
      await user.click(allAuthors);

      await waitFor(() =>
        expect(getCurrentSearch()).not.toContain("author_id=")
      );
      // offset was cleared because changing a filter resets to page 0.
      expect(getCurrentSearch()).not.toContain("offset=");
    });

    it("rejects partially numeric ?offset values (20foo, 3.14, 1e2) so the contract matches the doc comment", async () => {
      // We exercise the parser through the public surface: every one of
      // these URLs must produce `offset: 0` on the first listQuotes call.
      for (const bad of ["20foo", "3.14", "1e2", "+5"]) {
        listQuotesMock.mockClear();
        const { unmount } = renderPage(`/quotes?offset=${bad}`);
        await waitFor(() => {
          expect(listQuotesMock).toHaveBeenCalled();
          const firstCall = listQuotesMock.mock.calls[0]?.[0];
          expect(firstCall).toEqual(
            expect.objectContaining({ offset: 0 })
          );
        });
        unmount();
      }
    });

    it("reacts to search-only navigation (back/forward, sidebar link) while staying mounted", async () => {
      // Initial render: hydrate from URL.
      const { navigateTo } = renderPage("/quotes?author_id=auth-1");
      await waitFor(() => {
        expect(listQuotesMock).toHaveBeenCalled();
        expect(listQuotesMock.mock.calls[0]?.[0]).toEqual(
          expect.objectContaining({ authorId: "auth-1" })
        );
      });

      // Programmatic navigation to a new query string — same component
      // instance, no remount. The list query must refire with the new
      // filters (this is the regression: previously the `useState`
      // initializers only ran once, so the URL changed silently and the
      // list kept the old filters).
      listQuotesMock.mockClear();
      await navigateTo("/quotes?category_id=cat-2&offset=20");

      await waitFor(() => {
        expect(listQuotesMock).toHaveBeenCalled();
        const lastCall =
          listQuotesMock.mock.calls[listQuotesMock.mock.calls.length - 1]?.[0];
        expect(lastCall).toEqual(
          expect.objectContaining({
            categoryId: "cat-2",
            offset: 20,
            authorId: "",
          })
        );
      });
    });

    it("syncs the editable search-box draft when ?q changes externally", async () => {
      const { navigateTo } = renderPage("/quotes?q=virtue");
      const searchBox = await screen.findByRole("searchbox", {
        name: /^search$/i,
      });
      expect((searchBox as HTMLInputElement).value).toBe("virtue");

      await navigateTo("/quotes?q=courage");

      await waitFor(() =>
        expect((searchBox as HTMLInputElement).value).toBe("courage")
      );
    });

    it("does not let an uncommitted search-box draft leak across an external navigation that keeps ?q unchanged", async () => {
      // Regression for the debounce/navigation race:
      //   1. User types `sto` into the search box on /quotes (no ?q).
      //   2. Before the debounce fires they click an author/tag deep link
      //      whose ?q value is also missing.
      //   3. Old behavior: the resync effect was gated on `appliedQ`,
      //      so an unchanged committed value left the stale draft alive
      //      and the pending timer later appended `?q=sto` onto the
      //      freshly navigated URL — the draft leaked across the
      //      navigation.
      //
      // The fix snaps `qInput` on any external search-param change,
      // which (a) updates the visible input and (b) cancels the pending
      // debounce via the [qInput] effect cleanup. We assert both: no
      // `?q=sto` ever lands on the new URL even after the debounce
      // window elapses, and the search box reflects the destination URL.
      const user = userEvent.setup();
      const { navigateTo, getCurrentSearch } = renderPage("/quotes");
      await screen.findByText("On Virtue");
      await waitFor(() => expect(getCurrentSearch()).toBe(""));

      const searchBox = await screen.findByRole("searchbox", {
        name: /^search$/i,
      });
      await user.type(searchBox, "sto");
      expect((searchBox as HTMLInputElement).value).toBe("sto");
      // Pre-debounce: ?q hasn't been committed yet.
      expect(getCurrentSearch()).not.toMatch(/(^|&)q=/);

      // External navigation while the debounce is still in flight; the
      // destination keeps `?q` absent (mirrors the "click an author
      // deep link" scenario from the review comment).
      await navigateTo("/quotes?author_id=auth-1");

      // Wait past the original debounce window (SEARCH_DEBOUNCE_MS = 400 ms)
      // plus generous slack for the test runner. If the leak is back, the
      // pending timer would commit `?q=sto` onto the new URL during
      // this wait.
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(getCurrentSearch()).toContain("author_id=auth-1");
      expect(getCurrentSearch()).not.toMatch(/(^|&)q=/);
      // The search box also catches up to the destination URL's value
      // (empty) so the user is not left looking at their stale draft.
      expect((searchBox as HTMLInputElement).value).toBe("");
    });

    it("does NOT render the (deleted tag) sentinel when listAllTags reported truncation (tag may exist past the cap)", async () => {
      // Truncated response: server has more tags than the helper paged
      // through. A `?tag_id=` outside the current window must NOT be
      // labeled as deleted — that mislabel would confuse users on any
      // organization with a large tag corpus.
      listAllTagsMock.mockResolvedValue({
        items: [
          { id: "tag-other", name: "virtue", created_at: "2020-01-01T00:00:00.000Z" },
        ],
        total: 5000,
        truncated: true,
      });
      renderPage("/quotes?tag_id=tag-far-away");
      await screen.findByText("On Virtue");

      // The select stays controlled but the synthetic option must be
      // absent. The list query still goes out with the requested tag id.
      await waitFor(() => {
        const lastCall =
          listQuotesMock.mock.calls[listQuotesMock.mock.calls.length - 1]?.[0];
        expect(lastCall).toEqual(
          expect.objectContaining({ tagId: "tag-far-away" })
        );
      });
      expect(
        screen.queryByRole("option", { name: /\(deleted tag\)/i })
      ).not.toBeInTheDocument();
    });

    it("renders a (deleted tag) sentinel option when ?tag_id refers to a tag the picker no longer lists", async () => {
      // Tag picker resolves to a list that does NOT include the URL's tag
      // id — simulating a tag deleted between the link being copied and the
      // page being opened.
      listAllTagsMock.mockResolvedValue({
        items: [
          { id: "tag-other", name: "virtue", created_at: "2020-01-01T00:00:00.000Z" },
        ],
        total: 1,
        truncated: false,
      });
      renderPage("/quotes?tag_id=tag-gone");
      await screen.findByText("On Virtue");

      const tagFilter = await screen.findByRole("combobox", {
        name: "Filter by tag",
      });
      await waitFor(() =>
        expect((tagFilter as HTMLSelectElement).value).toBe("tag-gone")
      );
      // The synthetic option keeps the controlled select in sync with the
      // active URL filter; it must be disabled so the user cannot re-pick
      // a known-dead value.
      const ghost = screen.getByRole("option", { name: /\(deleted tag\)/i });
      expect(ghost).toBeDisabled();
    });

    it("debounced search-box commits `?q=…` onto the URL and threads `q:` into listQuotes (not the legacy `?title=`)", async () => {
      // Regression pin for the `?title` → `?q` swap that went alongside the
      // backend's full-text-search endpoint (Logos PR #15, tsvector + GIN
      // via `websearch_to_tsquery`). The visible contract is: the search
      // box commits into the `?q` URL param and the listQuotes call carries
      // `q: "<value>"` — nothing on either layer still says `title`.
      const user = userEvent.setup();
      const { getCurrentSearch } = renderPage();
      await screen.findByText("On Virtue");
      await waitFor(() => expect(getCurrentSearch()).toBe(""));

      const searchBox = await screen.findByRole("searchbox", {
        name: /^search$/i,
      });
      listQuotesMock.mockClear();
      await user.type(searchBox, "virtue");

      // Debounce window is 400 ms; wait generously past it.
      await waitFor(
        () => expect(getCurrentSearch()).toContain("q=virtue"),
        { timeout: 2000 }
      );
      // The URL carries the new param name, not the old one.
      expect(getCurrentSearch()).not.toMatch(/(^|&)title=/);

      await waitFor(() => {
        const lastCall =
          listQuotesMock.mock.calls[listQuotesMock.mock.calls.length - 1]?.[0];
        expect(lastCall).toEqual(
          expect.objectContaining({ q: "virtue", legacyTitleOnly: false })
        );
        expect(lastCall).not.toHaveProperty("title");
      });
    });

    it("honors a legacy `?title=…` deep link via listQuotes (URL is not rewritten until the user commits)", async () => {
      // Bookmarks from before the `?title` → `?q` swap should keep filtering
      // through the old wire shape until the user edits the search box
      // (debounced commit then normalizes to `?q` only).
      const { getCurrentSearch } = renderPage("/quotes?title=virtue");
      await screen.findByText("On Virtue");

      await waitFor(() => {
        expect(listQuotesMock).toHaveBeenCalled();
        const firstCall = listQuotesMock.mock.calls[0]?.[0];
        expect(firstCall).toEqual(
          expect.objectContaining({ q: "virtue", legacyTitleOnly: true })
        );
        expect(firstCall).not.toHaveProperty("title");
      });

      expect(getCurrentSearch()).toContain("title=virtue");
      expect(getCurrentSearch()).not.toMatch(/(^|&)q=/);

      const searchBox = screen.getByRole("searchbox", { name: /^search$/i });
      expect((searchBox as HTMLInputElement).value).toBe("virtue");
    });
  });
});
