import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { ToastProvider } from "@/components/ToastProvider";
import { ImagesPage } from "./ImagesPage";

const listImagesMock = vi.fn();
const listAllCategoriesByTypeMock = vi.fn();
const createImageMock = vi.fn();
const updateImageMock = vi.fn();
const deleteImageMock = vi.fn();
const uploadImageMock = vi.fn();

vi.mock("@/api/images", () => ({
  IMAGES_PAGE_SIZE: 20,
  listImages: (...args: unknown[]) => listImagesMock(...args),
  createImage: (...args: unknown[]) => createImageMock(...args),
  updateImage: (...args: unknown[]) => updateImageMock(...args),
  deleteImage: (...args: unknown[]) => deleteImageMock(...args),
  uploadImage: (...args: unknown[]) => uploadImageMock(...args),
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
      <ToastProvider>
        <ImagesPage />
      </ToastProvider>
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
    uploadImageMock.mockResolvedValue({
      id: "img-2",
      url: "/api/v1/images/img-2/blob",
      alt_text: null,
      category_id: null,
      source: "uploaded",
      created_at: "2020-01-02T00:00:00.000Z",
      updated_at: "2020-01-02T00:00:00.000Z",
    });
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

// ----------------------------------------------------------------------
// Tabbed Register Image panel + Upload-from-disk tab
// ----------------------------------------------------------------------

function makePngFile(name = "smiley.png", size = 64) {
  // The bytes do not matter for the test — they are forwarded to the
  // mocked uploadImage. We give it a real PNG-magic prefix so any
  // future client-side sniffing test would have something to work with.
  const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = new Uint8Array(Math.max(0, size - head.length));
  return new File([head, body], name, { type: "image/png" });
}

describe("ImagesPage register-image tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listImagesMock.mockResolvedValue(sampleList());
    listAllCategoriesByTypeMock.mockResolvedValue([
      { id: "cat-1", name: "Portrait", type: "image", created_at: "" },
    ]);
    createImageMock.mockResolvedValue({});
    uploadImageMock.mockResolvedValue({
      id: "img-2",
      url: "/api/v1/images/img-2/blob",
      alt_text: "Smile",
      category_id: null,
      source: "uploaded",
      created_at: "2020-01-02T00:00:00.000Z",
      updated_at: "2020-01-02T00:00:00.000Z",
    });
    deleteImageMock.mockResolvedValue(undefined);
    updateImageMock.mockResolvedValue({});

    // jsdom has no real Object URL implementation; stub it so the
    // upload preview effect runs without console noise. The tests do
    // not assert on the preview <img>'s src, only its presence.
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        value: vi.fn(() => "blob:mock"),
        writable: true,
      });
    }
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        value: vi.fn(),
        writable: true,
      });
    }
  });

  it("starts on the URL tab and exposes both tab buttons", async () => {
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });

    const urlTab = screen.getByRole("tab", { name: /by url/i });
    const uploadTab = screen.getByRole("tab", { name: /upload from disk/i });
    expect(urlTab).toHaveAttribute("aria-selected", "true");
    expect(uploadTab).toHaveAttribute("aria-selected", "false");
    // The URL form is the visible panel.
    expect(
      screen.getByRole("button", { name: /^create$/i })
    ).toBeInTheDocument();
  });

  it("switches to the Upload tab on click", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });

    await user.click(screen.getByRole("tab", { name: /upload from disk/i }));
    expect(
      screen.getByRole("tab", { name: /upload from disk/i })
    ).toHaveAttribute("aria-selected", "true");
    // The Upload button is gated by file selection, but its presence is
    // proof the panel switched.
    expect(
      screen.getByRole("button", { name: /^upload$/i })
    ).toBeInTheDocument();
  });

  it("rejects unsupported file types client-side without calling uploadImage", async () => {
    // `applyAccept: false` lets the file flow into the change handler in
    // jsdom; in a real browser the `accept` attribute would already have
    // filtered the picker, but the input's `onChange` is the only place
    // we can surface the "unsupported type" error and still gate the
    // submit button on the resulting state. user-event v14 makes this
    // a `setup`-time config rather than a per-call option.
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });
    await user.click(screen.getByRole("tab", { name: /upload from disk/i }));

    const input = screen.getByLabelText(/image file/i) as HTMLInputElement;
    const bogus = new File(["not an image"], "boom.txt", {
      type: "text/plain",
    });
    await user.upload(input, bogus);

    expect(
      await screen.findByText(/unsupported file type/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^upload$/i })
    ).toBeDisabled();
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it("submits a valid file with optional alt text", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });
    await user.click(screen.getByRole("tab", { name: /upload from disk/i }));

    const input = screen.getByLabelText(/image file/i) as HTMLInputElement;
    const file = makePngFile();
    await user.upload(input, file);

    await user.type(screen.getByLabelText(/alt text/i), "Smile");

    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    await waitFor(() => expect(uploadImageMock).toHaveBeenCalledTimes(1));
    expect(uploadImageMock).toHaveBeenCalledWith(file, {
      alt_text: "Smile",
      category_id: null,
    });
  });

  it("surfaces server errors from upload", async () => {
    uploadImageMock.mockRejectedValueOnce(
      new ApiError("upload exceeds 10485760 bytes", 413, {})
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });
    await user.click(screen.getByRole("tab", { name: /upload from disk/i }));

    await user.upload(
      screen.getByLabelText(/image file/i) as HTMLInputElement,
      makePngFile()
    );
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    // The same message lands in two places: the inline `<p class="error">`
    // and the toast (`Could not upload image: …`). Wait for at least one,
    // then assert there are exactly two so a future regression that drops
    // either surface is caught.
    await waitFor(() =>
      expect(
        screen.getAllByText(/upload exceeds 10485760 bytes/i)
      ).toHaveLength(2)
    );
  });
});
