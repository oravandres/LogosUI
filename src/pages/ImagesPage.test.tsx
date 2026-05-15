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
const generateImageMock = vi.fn();

vi.mock("@/api/images", () => ({
  IMAGES_PAGE_SIZE: 20,
  // Re-export the static catalog under the same names the component
  // imports. Keeping the model list in lock-step with the production
  // module avoids the test mock drifting silently from what the page
  // actually renders.
  IMAGE_GEN_MODELS: [
    { id: "flux2-dev", label: "FLUX2-dev (default)" },
    { id: "flux2-klein", label: "FLUX2-klein" },
    { id: "qwen-image", label: "Qwen-Image" },
    { id: "hunyuanimage-3-instruct", label: "HunyuanImage-3-instruct" },
  ],
  DEFAULT_IMAGE_GEN_MODEL_ID: "flux2-dev",
  listImages: (...args: unknown[]) => listImagesMock(...args),
  createImage: (...args: unknown[]) => createImageMock(...args),
  updateImage: (...args: unknown[]) => updateImageMock(...args),
  deleteImage: (...args: unknown[]) => deleteImageMock(...args),
  uploadImage: (...args: unknown[]) => uploadImageMock(...args),
  generateImage: (...args: unknown[]) => generateImageMock(...args),
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

// ----------------------------------------------------------------------
// Generate tab — synchronous POST /api/v1/images:generate
// ----------------------------------------------------------------------

describe("ImagesPage register-image > Generate tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listImagesMock.mockResolvedValue(sampleList());
    listAllCategoriesByTypeMock.mockResolvedValue([
      { id: "cat-1", name: "Portrait", type: "image", created_at: "" },
    ]);
    createImageMock.mockResolvedValue({});
    deleteImageMock.mockResolvedValue(undefined);
    updateImageMock.mockResolvedValue({});
    uploadImageMock.mockResolvedValue({});
    generateImageMock.mockResolvedValue({
      id: "img-gen-1",
      url: "/api/v1/images/img-gen-1/blob",
      alt_text: null,
      category_id: null,
      source: "generated",
      prompt: "A serene mountain lake at dawn",
      model: "flux2-dev",
      width: 1024,
      height: 1024,
      created_at: "2020-01-03T00:00:00.000Z",
      updated_at: "2020-01-03T00:00:00.000Z",
    });
  });

  async function openGenerateTab(user: ReturnType<typeof userEvent.setup>) {
    renderPage();
    await screen.findByRole("link", { name: /example\.test/ });
    await user.click(screen.getByRole("tab", { name: /generate/i }));
  }

  it("exposes the third tab and renders the prompt + model picker", async () => {
    const user = userEvent.setup();
    await openGenerateTab(user);

    expect(
      screen.getByRole("tab", { name: /generate/i })
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/^prompt$/i)).toBeInTheDocument();
    const modelSelect = screen.getByLabelText(/^model$/i) as HTMLSelectElement;
    expect(modelSelect.value).toBe("flux2-dev");
    // The advanced size/seed group is collapsed by default but its
    // inputs are still in the DOM (a `<details>` only hides them
    // visually).
    expect(screen.getByLabelText(/^seed/i)).toBeInTheDocument();
  });

  it("rejects an empty prompt before calling the network", async () => {
    const user = userEvent.setup();
    await openGenerateTab(user);

    // Generate button is disabled when the prompt is empty (defense in
    // depth) — but we also assert the form-level guard if the user
    // forces a submit (some browsers will allow `Enter` from a
    // textarea).
    const generateBtn = screen.getByRole("button", { name: /^generate$/i });
    expect(generateBtn).toBeDisabled();

    // Type one character and clear so the textarea is "touched" but
    // empty.
    const prompt = screen.getByLabelText(/^prompt$/i);
    await user.type(prompt, " ");
    expect(generateBtn).toBeDisabled();
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  it("submits prompt, model, and dimensions to the generator", async () => {
    const user = userEvent.setup();
    await openGenerateTab(user);

    await user.type(
      screen.getByLabelText(/^prompt$/i),
      "A serene mountain lake at dawn"
    );

    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    await waitFor(() => expect(generateImageMock).toHaveBeenCalledTimes(1));
    expect(generateImageMock).toHaveBeenCalledWith({
      prompt: "A serene mountain lake at dawn",
      model: "flux2-dev",
      width: 1024,
      height: 1024,
      seed: 0,
      steps: 0,
      cfg_scale: 0,
      alt_text: null,
      category_id: null,
    });
  });

  it("maps a 504 to a 'timed out' inline message", async () => {
    generateImageMock.mockRejectedValueOnce(
      new ApiError("image generation timed out", 504, {
        error: "image generation timed out",
        details: "context deadline exceeded",
      })
    );
    const user = userEvent.setup();
    await openGenerateTab(user);
    await user.type(screen.getByLabelText(/^prompt$/i), "windmill");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    await screen.findByText(
      /generation timed out — try a shorter prompt or smaller size/i
    );
    // The toast also surfaces the original message; that's separate
    // from the friendly inline rephrase.
    expect(
      screen.getByText(/generation timed out — try a shorter prompt/i)
    ).toBeInTheDocument();
  });

  it("maps a 502 with details to a 'failed: {details}' inline message", async () => {
    generateImageMock.mockRejectedValueOnce(
      new ApiError("image generation failed", 502, {
        error: "image generation failed",
        details: "FLUX2 worker exited code 137",
      })
    );
    const user = userEvent.setup();
    await openGenerateTab(user);
    await user.type(screen.getByLabelText(/^prompt$/i), "OOM scene");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    await screen.findByText(
      /generation failed: flux2 worker exited code 137/i
    );
  });

  it("locks the panel after a 503 with an explanatory banner", async () => {
    generateImageMock.mockRejectedValueOnce(
      new ApiError("image generation is not configured", 503, {
        error: "image generation is not configured",
      })
    );
    const user = userEvent.setup();
    await openGenerateTab(user);
    await user.type(screen.getByLabelText(/^prompt$/i), "a banner");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    // The panel collapses to the "not configured" banner; the form is
    // unmounted so submit can't be retried until a reload.
    const banner = await screen.findByTestId("generate-disabled-banner");
    expect(banner).toHaveTextContent(
      /image generation is not configured on this server/i
    );
    expect(
      screen.queryByRole("button", { name: /^generate$/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^prompt$/i)).not.toBeInTheDocument();
  });

  it("clears the form and surfaces a success toast on success", async () => {
    const user = userEvent.setup();
    await openGenerateTab(user);
    const promptField = screen.getByLabelText(/^prompt$/i) as HTMLTextAreaElement;
    await user.type(promptField, "soft mist over a lake");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    await waitFor(() => expect(generateImageMock).toHaveBeenCalled());
    // Prompt resets after the mutation settles so the user can start a
    // new generation without first clearing manually.
    await waitFor(() => expect(promptField.value).toBe(""));
    expect(
      await screen.findByText(/image generated/i)
    ).toBeInTheDocument();
  });
});
