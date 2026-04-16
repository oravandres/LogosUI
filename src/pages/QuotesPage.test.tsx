import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuotesPage />
    </QueryClientProvider>
  );
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
  });

  it("renders the quote from the list", async () => {
    renderPage();
    expect(await screen.findByText("On Virtue")).toBeInTheDocument();
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
});
