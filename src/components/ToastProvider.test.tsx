import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "./useToast";

function TestHarness({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useToast>) => void;
}) {
  const api = useToast();
  onReady(api);
  return null;
}

function renderWithToasts() {
  let api!: ReturnType<typeof useToast>;
  render(
    <ToastProvider>
      <TestHarness onReady={(a) => { api = a; }} />
    </ToastProvider>
  );
  return api;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws a clear error when useToast is used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<TestHarness onReady={() => {}} />)
    ).toThrow(/useToast must be used inside <ToastProvider>/);
    spy.mockRestore();
  });

  it("renders success toasts in the polite live region", () => {
    const api = renderWithToasts();
    act(() => {
      api.success("Saved");
    });
    const polite = screen.getByRole("status", { name: /notifications/i });
    expect(polite).toHaveAttribute("aria-live", "polite");
    expect(within(polite).getByText("Saved")).toBeInTheDocument();
  });

  it("renders error toasts in the assertive live region with the error suffix", () => {
    const api = renderWithToasts();
    act(() => {
      api.error("Could not save", new ApiError("server fell over", 500, {}));
    });
    const assertive = screen.getByRole("alert", { name: /errors/i });
    expect(assertive).toHaveAttribute("aria-live", "assertive");
    expect(
      within(assertive).getByText(/Could not save: server fell over/)
    ).toBeInTheDocument();
  });

  it("auto-dismisses success toasts after the timeout", () => {
    const api = renderWithToasts();
    act(() => {
      api.success("Saved");
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("error toasts persist longer than success toasts", () => {
    const api = renderWithToasts();
    act(() => {
      api.error("boom");
    });
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.getByText("boom")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3001);
    });
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("dismiss button removes the toast immediately", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const api = renderWithToasts();
    act(() => {
      api.success("Saved");
    });
    const region = screen.getByRole("status", { name: /notifications/i });
    await user.click(
      within(region).getByRole("button", { name: /dismiss/i })
    );
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("caps visible toasts to four (oldest is dropped)", () => {
    const api = renderWithToasts();
    act(() => {
      api.success("a");
      api.success("b");
      api.success("c");
      api.success("d");
      api.success("e");
    });
    expect(screen.queryByText("a")).not.toBeInTheDocument();
    for (const txt of ["b", "c", "d", "e"]) {
      expect(screen.getByText(txt)).toBeInTheDocument();
    }
  });
});
