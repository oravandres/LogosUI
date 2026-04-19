import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QuoteForm } from "./QuoteForm";
import {
  buildQuoteWriteBody,
  emptyQuoteFormValues,
  quoteToFormValues,
  type QuoteFormValues,
} from "./quoteForm.helpers";

const listAllCategoriesByTypeMock = vi.fn();
const listImagesMock = vi.fn();
const getImageMock = vi.fn();
const listAuthorsMock = vi.fn();
const getAuthorMock = vi.fn();

vi.mock("@/api/categories", () => ({
  listAllCategoriesByType: (...args: unknown[]) =>
    listAllCategoriesByTypeMock(...args),
}));

vi.mock("@/api/images", () => ({
  listImages: (...args: unknown[]) => listImagesMock(...args),
  getImage: (...args: unknown[]) => getImageMock(...args),
}));

vi.mock("@/api/authors", () => ({
  listAuthors: (...args: unknown[]) => listAuthorsMock(...args),
  getAuthor: (...args: unknown[]) => getAuthorMock(...args),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listAllCategoriesByTypeMock.mockResolvedValue([
    { id: "cat-1", name: "Ethics", type: "quote" },
  ]);
  listImagesMock.mockResolvedValue({
    items: [
      {
        id: "img-1",
        url: "https://example.test/img-1.jpg",
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
    ],
    total: 1,
    offset: 0,
    limit: 50,
  });
  getImageMock.mockResolvedValue({
    id: "img-rare",
    url: "https://example.test/img-rare.jpg",
    created_at: "2020-01-01T00:00:00Z",
    updated_at: "2020-01-01T00:00:00Z",
  });
  listAuthorsMock.mockResolvedValue({
    items: [{ id: "auth-1", name: "Aristotle" }],
    total: 1,
    offset: 0,
    limit: 20,
  });
  getAuthorMock.mockResolvedValue({ id: "auth-1", name: "Aristotle" });
});

function renderForm(props: Partial<React.ComponentProps<typeof QuoteForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <QueryClientProvider client={makeClient()}>
      <QuoteForm
        mode="create"
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    </QueryClientProvider>
  );
  return { ...utils, onSubmit, onCancel };
}

describe("buildQuoteWriteBody", () => {
  it("rejects an empty title", () => {
    const r = buildQuoteWriteBody({
      ...emptyQuoteFormValues,
      title: "   ",
      text: "x",
      author_id: "a-1",
    });
    expect(r).toEqual({ ok: false, error: "Title is required." });
  });

  it("rejects an empty text", () => {
    const r = buildQuoteWriteBody({
      ...emptyQuoteFormValues,
      title: "A",
      text: "",
      author_id: "a-1",
    });
    expect(r).toEqual({ ok: false, error: "Text is required." });
  });

  it("rejects when author_id is empty", () => {
    const r = buildQuoteWriteBody({
      title: "A",
      text: "B",
      author_id: "",
      image_id: "",
      category_id: "",
    });
    expect(r).toEqual({ ok: false, error: "Author is required." });
  });

  it("trims title/text and projects empty optional ids to null", () => {
    const r = buildQuoteWriteBody({
      title: "  A  ",
      text: "  B  ",
      author_id: "a-1",
      image_id: "",
      category_id: "",
    });
    expect(r).toEqual({
      ok: true,
      body: {
        title: "A",
        text: "B",
        author_id: "a-1",
        image_id: null,
        category_id: null,
      },
    });
  });

  it("preserves non-empty optional ids verbatim", () => {
    const r = buildQuoteWriteBody({
      title: "A",
      text: "B",
      author_id: "a-1",
      image_id: "img-1",
      category_id: "cat-1",
    });
    expect(r).toEqual({
      ok: true,
      body: {
        title: "A",
        text: "B",
        author_id: "a-1",
        image_id: "img-1",
        category_id: "cat-1",
      },
    });
  });
});

describe("quoteToFormValues", () => {
  it("projects null image_id / category_id to empty strings", () => {
    expect(
      quoteToFormValues({
        title: "A",
        text: "B",
        author_id: "a-1",
        image_id: null,
        category_id: null,
      })
    ).toEqual({
      title: "A",
      text: "B",
      author_id: "a-1",
      image_id: "",
      category_id: "",
    });
  });

  it("preserves non-null ids verbatim", () => {
    expect(
      quoteToFormValues({
        title: "A",
        text: "B",
        author_id: "a-1",
        image_id: "img-1",
        category_id: "cat-1",
      })
    ).toEqual({
      title: "A",
      text: "B",
      author_id: "a-1",
      image_id: "img-1",
      category_id: "cat-1",
    });
  });
});

describe("<QuoteForm mode='create'>", () => {
  it("blocks submit when title is empty and surfaces the validation error", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submit when text is empty after a non-empty title", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    const title = screen
      .getAllByRole("textbox")
      .find((el) => (el as HTMLInputElement).maxLength === 500);
    await user.type(title as HTMLInputElement, "Hello");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(screen.getByText("Text is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submit when author_id is unset after title + text are filled", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    const textboxes = screen.getAllByRole("textbox");
    const title = textboxes.find(
      (el) => (el as HTMLInputElement).maxLength === 500
    );
    const text = textboxes.find((el) => el.tagName === "TEXTAREA");
    await user.type(title as HTMLInputElement, "Hello");
    await user.type(text as HTMLTextAreaElement, "World");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(screen.getByText("Author is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("emits a fully-projected QuoteWriteBody on a valid submit (image / category default to null)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    const textboxes = screen.getAllByRole("textbox");
    const title = textboxes.find(
      (el) => (el as HTMLInputElement).maxLength === 500
    );
    const text = textboxes.find((el) => el.tagName === "TEXTAREA");
    await user.type(title as HTMLInputElement, "  Hello  ");
    await user.type(text as HTMLTextAreaElement, "  World  ");

    const author = screen.getByRole("combobox", { name: "Author" });
    await user.click(author);
    const opt = await screen.findByRole("option", { name: "Aristotle" });
    await user.click(opt);

    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Hello",
        text: "World",
        author_id: "auth-1",
        image_id: null,
        category_id: null,
      })
    );
  });

  it("does not autofocus the title input", async () => {
    renderForm();
    const title = screen
      .getAllByRole("textbox")
      .find((el) => (el as HTMLInputElement).maxLength === 500);
    // Document.activeElement is the body until the user (or autofocus)
    // moves focus. Asserting NOT-focus prevents future regressions where
    // someone reflexively adds `autoFocus` to the create form and traps
    // users who landed on the page intending to scroll/read.
    expect(title).not.toBe(document.activeElement);
  });

  it("renders the create-mode field hints (author + image)", () => {
    renderForm();
    expect(
      screen.getByText(/Type to search authors by name/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Focus to load up to 50 images/i)
    ).toBeInTheDocument();
  });

  it("does not render a Cancel button in create mode", () => {
    renderForm();
    expect(
      screen.queryByRole("button", { name: /^cancel$/i })
    ).not.toBeInTheDocument();
  });

  it("renders the parent's submitError below the form", () => {
    renderForm({ submitError: "Server is on fire" });
    expect(screen.getByText("Server is on fire")).toBeInTheDocument();
  });

  it("relabels the submit button while isSubmitting and disables the title field", () => {
    renderForm({ isSubmitting: true });
    expect(
      screen.getByRole("button", { name: /^creating…$/i })
    ).toBeDisabled();
    const title = screen
      .getAllByRole("textbox")
      .find((el) => (el as HTMLInputElement).maxLength === 500);
    expect(title).toBeDisabled();
  });

  it("forwards the title input ref so a parent CTA can focus it", async () => {
    function Harness() {
      const ref = useRef<HTMLInputElement | null>(null);
      return (
        <QueryClientProvider client={makeClient()}>
          <button
            type="button"
            data-testid="focus-cta"
            onClick={() => ref.current?.focus()}
          >
            focus
          </button>
          <QuoteForm
            mode="create"
            isSubmitting={false}
            onSubmit={vi.fn()}
            titleInputRef={ref}
          />
        </QueryClientProvider>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const title = screen
      .getAllByRole("textbox")
      .find((el) => (el as HTMLInputElement).maxLength === 500);
    expect(title).not.toBe(document.activeElement);
    await user.click(screen.getByTestId("focus-cta"));
    expect(title).toBe(document.activeElement);
  });
});

const aristotle = {
  id: "auth-1",
  name: "Aristotle",
  bio: null,
  born_date: null,
  died_date: null,
  image_id: null,
  category_id: null,
};

const initialEditValues: QuoteFormValues = {
  title: "On Virtue",
  text: "Virtue is a habit.",
  author_id: "auth-1",
  image_id: "",
  category_id: "",
};

describe("<QuoteForm mode='edit'>", () => {
  beforeEach(() => {
    listAuthorsMock.mockResolvedValue({
      items: [aristotle],
      total: 1,
      offset: 0,
      limit: 20,
    });
    getAuthorMock.mockResolvedValue(aristotle);
  });

  it("seeds title and text from initialValues", async () => {
    renderForm({
      mode: "edit",
      initialValues: initialEditValues,
    });
    expect(
      await screen.findByDisplayValue("On Virtue")
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Virtue is a habit.")).toBeInTheDocument();
  });

  it("autofocuses the title input on mount (entering edit was a deliberate user action)", async () => {
    renderForm({
      mode: "edit",
      initialValues: initialEditValues,
    });
    const title = await screen.findByDisplayValue("On Virtue");
    expect(title).toBe(document.activeElement);
  });

  it("threads quoteTitleForA11y into per-field aria-labels (e.g. 'Title — On Virtue')", async () => {
    renderForm({
      mode: "edit",
      initialValues: initialEditValues,
      quoteTitleForA11y: "On Virtue",
    });
    expect(
      await screen.findByRole("textbox", { name: /title — on virtue/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /text — on virtue/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /author — on virtue/i })
    ).toBeInTheDocument();
  });

  it("renders Save / Cancel buttons; submits the body on Save and calls onCancel on Cancel", async () => {
    const user = userEvent.setup();
    const { onSubmit, onCancel } = renderForm({
      mode: "edit",
      initialValues: initialEditValues,
      quoteTitleForA11y: "On Virtue",
    });

    await screen.findByDisplayValue("On Virtue");

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "On Virtue",
        text: "Virtue is a habit.",
        author_id: "auth-1",
        image_id: null,
        category_id: null,
      })
    );

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not render the create-mode field hints", () => {
    renderForm({
      mode: "edit",
      initialValues: initialEditValues,
    });
    expect(
      screen.queryByText(/Type to search authors by name/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Focus to load up to 50 images/i)
    ).not.toBeInTheDocument();
  });

  it("relabels the submit button while isSubmitting (Save → Saving…)", () => {
    renderForm({
      mode: "edit",
      initialValues: initialEditValues,
      isSubmitting: true,
    });
    expect(
      screen.getByRole("button", { name: /^saving…$/i })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /^cancel$/i })
    ).toBeDisabled();
  });

  it("eagerly arms the image picker when initialValues carries an image_id", async () => {
    listImagesMock.mockResolvedValue({
      items: [
        {
          id: "img-eager",
          url: "https://example.test/eager.jpg",
          created_at: "2020-01-01T00:00:00Z",
          updated_at: "2020-01-01T00:00:00Z",
        },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    });
    renderForm({
      mode: "edit",
      initialValues: { ...initialEditValues, image_id: "img-eager" },
    });
    // Without arming, listImages is never called. With eager arming on
    // mount, the bounded picker fetch fires immediately so the <select>
    // can render the current image label rather than only its raw id.
    await waitFor(() => expect(listImagesMock).toHaveBeenCalled());
  });

  it("falls back to getImage(id) when the seeded image_id is outside the bounded picker window", async () => {
    listImagesMock.mockResolvedValue({
      items: [
        {
          id: "img-1",
          url: "https://example.test/img-1.jpg",
          created_at: "2020-01-01T00:00:00Z",
          updated_at: "2020-01-01T00:00:00Z",
        },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    });
    renderForm({
      mode: "edit",
      initialValues: { ...initialEditValues, image_id: "img-rare" },
    });
    await waitFor(() =>
      expect(getImageMock).toHaveBeenCalledWith("img-rare", expect.anything())
    );
  });

  it("re-seeds when initialValues identity changes (e.g. parent refetched the quote)", async () => {
    function Harness() {
      const [v, setV] = useState<QuoteFormValues>(initialEditValues);
      return (
        <QueryClientProvider client={makeClient()}>
          <button
            type="button"
            data-testid="reseed"
            onClick={() =>
              setV({
                ...initialEditValues,
                title: "Refetched Title",
                text: "Refetched text.",
              })
            }
          >
            reseed
          </button>
          <QuoteForm
            mode="edit"
            initialValues={v}
            isSubmitting={false}
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
          />
        </QueryClientProvider>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByDisplayValue("On Virtue");
    await user.click(screen.getByTestId("reseed"));
    expect(screen.getByDisplayValue("Refetched Title")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Refetched text.")).toBeInTheDocument();
  });
});
