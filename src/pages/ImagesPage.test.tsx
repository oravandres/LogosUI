import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { ImagesPage } from "./ImagesPage";

const listImagesMock = vi.fn();
const listAllCategoriesByTypeMock = vi.fn();
const createImageMock = vi.fn();
const updateImageMock = vi.fn();
const deleteImageMock = vi.fn();

vi.mock("@/api/images", () => ({
  IMAGES_PAGE_SIZE: 20,
  listImages: (...args: unknown[]) => listImagesMock(...args),
  createImage: (...args: unknown[]) => createImageMock(...args),
  updateImage: (...args: unknown[]) => updateImageMock(...args),
  deleteImage: (...args: unknown[]) => deleteImageMock(...args),
}));

vi.mock("@/api/categories", () => ({
  listAllCategoriesByType: (...args: unknown[]) =>
    listAllCategoriesByTypeMock(...args),
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
      <ImagesPage />
    </QueryClientProvider>
  );
}

function sampleList() {
  return {
    items: [
      {
        id: "img-1",
        url: "https://example.test/a.png",
        alt_text: "Alpha",
        category_id: null,
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
      },
    ],
    total: 1,
    offset: 0,
    limit: 20,
  };
}

describe("ImagesPage inline edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listImagesMock.mockResolvedValue(sampleList());
    listAllCategoriesByTypeMock.mockResolvedValue([]);
    createImageMock.mockResolvedValue({});
    deleteImageMock.mockResolvedValue(undefined);
    updateImageMock.mockResolvedValue({
      id: "img-1",
      url: "https://example.test/b.png",
      alt_text: "Alpha",
      category_id: null,
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
    });
  });

  it("shows client-side validation when URL is empty on save", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const urlField = screen.getByRole("textbox", { name: /url —/i });
    await user.clear(urlField);
    await user.click(
      screen.getByRole("button", { name: /save changes for image/i })
    );
    expect(screen.getByText("URL is required.")).toBeInTheDocument();
    expect(updateImageMock).not.toHaveBeenCalled();
  });

  it("submits update on save success", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const urlField = screen.getByRole("textbox", { name: /url —/i });
    await user.clear(urlField);
    await user.type(urlField, "https://example.test/b.png");
    await user.click(
      screen.getByRole("button", { name: /save changes for image/i })
    );
    await waitFor(() =>
      expect(updateImageMock).toHaveBeenCalledWith("img-1", {
        url: "https://example.test/b.png",
        alt_text: "Alpha",
        category_id: null,
      })
    );
  });

  it("surfaces server errors from update", async () => {
    updateImageMock.mockRejectedValueOnce(
      new ApiError("Image is locked", 500, {})
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const urlField = screen.getByRole("textbox", { name: /url —/i });
    await user.clear(urlField);
    await user.type(urlField, "https://example.test/b.png");
    await user.click(
      screen.getByRole("button", { name: /save changes for image/i })
    );
    await screen.findByText("Image is locked");
    expect(updateImageMock).toHaveBeenCalled();
  });
});
