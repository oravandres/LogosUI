import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthorsPage />
      </ToastProvider>
    </QueryClientProvider>
  );
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
