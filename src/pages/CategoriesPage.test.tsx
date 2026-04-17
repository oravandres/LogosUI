import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { ToastProvider } from "@/components/ToastProvider";
import { CategoriesPage } from "./CategoriesPage";

const listCategoriesMock = vi.fn();
const updateCategoryMock = vi.fn();
const createCategoryMock = vi.fn();
const deleteCategoryMock = vi.fn();

vi.mock("@/api/categories", () => ({
  CATEGORIES_PAGE_SIZE: 20,
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  createCategory: (...args: unknown[]) => createCategoryMock(...args),
  updateCategory: (...args: unknown[]) => updateCategoryMock(...args),
  deleteCategory: (...args: unknown[]) => deleteCategoryMock(...args),
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
        <CategoriesPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function sampleList() {
  return {
    items: [
      {
        id: "cat-1",
        name: "Alpha",
        type: "quote",
        created_at: "2020-01-01T00:00:00.000Z",
      },
    ],
    total: 1,
    offset: 0,
    limit: 20,
  };
}

describe("CategoriesPage inline edit", () => {
  beforeEach(() => {
    listCategoriesMock.mockResolvedValue(sampleList());
    createCategoryMock.mockResolvedValue({
      id: "new",
      name: "x",
      type: "quote",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    deleteCategoryMock.mockResolvedValue(undefined);
    updateCategoryMock.mockResolvedValue({
      id: "cat-1",
      name: "Beta",
      type: "quote",
      created_at: "2020-01-01T00:00:00.000Z",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows client-side validation when name is empty on save", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByRole("textbox", { name: /name — alpha/i });
    await user.clear(nameField);
    await user.click(
      screen.getByRole("button", { name: /save changes for category alpha/i })
    );
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(updateCategoryMock).not.toHaveBeenCalled();
  });

  it("submits update on save success", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByRole("textbox", { name: /name — alpha/i });
    await user.clear(nameField);
    await user.type(nameField, "Beta");
    await user.click(
      screen.getByRole("button", { name: /save changes for category alpha/i })
    );
    await waitFor(() =>
      expect(updateCategoryMock).toHaveBeenCalledWith("cat-1", {
        name: "Beta",
        type: "quote",
      })
    );
  });

  it("surfaces server errors from update", async () => {
    updateCategoryMock.mockRejectedValueOnce(
      new ApiError("Category is locked", 500, {})
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByRole("textbox", { name: /name — alpha/i });
    await user.clear(nameField);
    await user.type(nameField, "Beta");
    await user.click(
      screen.getByRole("button", { name: /save changes for category alpha/i })
    );
    await screen.findByText("Category is locked");
    expect(updateCategoryMock).toHaveBeenCalled();
  });

  it("emits a success toast when create succeeds", async () => {
    createCategoryMock.mockResolvedValueOnce({
      id: "cat-2",
      name: "Gamma",
      type: "quote",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alpha");
    const nameField = screen.getByRole("textbox", { name: /^name$/i });
    await user.type(nameField, "Gamma");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await screen.findByText(/Category "Gamma" created/);
  });

  it("shows the filter-aware empty state with a Clear filter button when a type filter yields nothing", async () => {
    listCategoriesMock.mockImplementation(async (args: { type?: string }) => {
      if (args?.type === "image") {
        return { items: [], total: 0, offset: 0, limit: 20 };
      }
      return sampleList();
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alpha");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /filter by type/i }),
      "image"
    );
    await screen.findByRole("heading", {
      level: 4,
      name: /no categories match this filter/i,
    });
    await user.click(screen.getByRole("button", { name: /clear filter/i }));
    await screen.findByText("Alpha");
  });

  it("shows the create CTA empty state when the whole list is empty, and focuses the name input on click", async () => {
    listCategoriesMock.mockResolvedValueOnce({
      items: [],
      total: 0,
      offset: 0,
      limit: 20,
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", {
      level: 4,
      name: /no categories yet/i,
    });
    await user.click(
      screen.getByRole("button", { name: /create a category/i })
    );
    expect(screen.getByRole("textbox", { name: /^name$/i })).toHaveFocus();
  });

  it("emits an error toast when update fails (alongside the inline banner)", async () => {
    updateCategoryMock.mockRejectedValueOnce(
      new ApiError("Category is locked", 500, {})
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByRole("textbox", { name: /name — alpha/i });
    await user.clear(nameField);
    await user.type(nameField, "Beta");
    await user.click(
      screen.getByRole("button", { name: /save changes for category alpha/i })
    );
    const errorRegion = await screen.findByRole("alert", { name: /errors/i });
    expect(errorRegion).toHaveTextContent(
      /Could not update category: Category is locked/
    );
  });
});
