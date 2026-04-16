import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { TagsPage } from "./TagsPage";

const listTagsMock = vi.fn();
const createTagMock = vi.fn();
const deleteTagMock = vi.fn();

vi.mock("@/api/tags", () => ({
  TAGS_PAGE_SIZE: 20,
  listTags: (...args: unknown[]) => listTagsMock(...args),
  createTag: (...args: unknown[]) => createTagMock(...args),
  deleteTag: (...args: unknown[]) => deleteTagMock(...args),
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
      <TagsPage />
    </QueryClientProvider>
  );
}

function sampleList() {
  return {
    items: [
      {
        id: "tag-1",
        name: "wisdom",
        created_at: "2020-01-01T00:00:00.000Z",
      },
    ],
    total: 1,
    offset: 0,
    limit: 20,
  };
}

describe("TagsPage", () => {
  beforeEach(() => {
    listTagsMock.mockResolvedValue(sampleList());
    createTagMock.mockResolvedValue({
      id: "tag-new",
      name: "virtue",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    deleteTagMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a tag row from the list", async () => {
    renderPage();
    await screen.findByText("wisdom");
  });

  describe("create form", () => {
    it("validates that name is required", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("wisdom");
      await user.click(screen.getByRole("button", { name: /^create$/i }));
      expect(screen.getByText("Name is required.")).toBeInTheDocument();
      expect(createTagMock).not.toHaveBeenCalled();
    });

    it("submits a valid tag", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("wisdom");
      await user.type(
        screen.getByRole("textbox", { name: "Tag name" }),
        "virtue"
      );
      await user.click(screen.getByRole("button", { name: /^create$/i }));
      await waitFor(() =>
        expect(createTagMock).toHaveBeenCalledWith({ name: "virtue" })
      );
    });

    it("surfaces server errors (e.g. 409 on duplicate)", async () => {
      createTagMock.mockRejectedValueOnce(
        new ApiError("tag with this name already exists", 409, {})
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("wisdom");
      await user.type(
        screen.getByRole("textbox", { name: "Tag name" }),
        "wisdom"
      );
      await user.click(screen.getByRole("button", { name: /^create$/i }));
      await screen.findByText("tag with this name already exists");
    });
  });

  describe("delete", () => {
    it("confirms, calls the API, and refreshes", async () => {
      const confirmSpy = vi
        .spyOn(window, "confirm")
        .mockReturnValue(true);
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("wisdom");
      await user.click(
        screen.getByRole("button", { name: /delete tag wisdom/i })
      );
      await waitFor(() => expect(deleteTagMock).toHaveBeenCalledWith("tag-1"));
      expect(confirmSpy).toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("does nothing when the user cancels the confirm", async () => {
      const confirmSpy = vi
        .spyOn(window, "confirm")
        .mockReturnValue(false);
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("wisdom");
      await user.click(
        screen.getByRole("button", { name: /delete tag wisdom/i })
      );
      expect(deleteTagMock).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });
});
