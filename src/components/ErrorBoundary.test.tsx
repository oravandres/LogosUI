import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ when }: { when: boolean }) {
  if (when) throw new Error("kaboom");
  return <p>safe content</p>;
}

/** Toggles `Boom`'s `when` prop so we can prove `reset` re-renders children. */
function Toggle() {
  const [exploding, setExploding] = useState(true);
  return (
    <ErrorBoundary
      fallback={({ reset, error }) => (
        <div role="alert">
          <p>caught: {error.message}</p>
          <button
            type="button"
            onClick={() => {
              setExploding(false);
              reset();
            }}
          >
            recover
          </button>
        </div>
      )}
    >
      <Boom when={exploding} />
    </ErrorBoundary>
  );
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error is thrown", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom when={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("renders the default fallback when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom when />
      </ErrorBoundary>
    );
    expect(
      screen.getByRole("heading", { name: /something went wrong/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
    // The raw error message must NOT be surfaced to the user.
    expect(screen.queryByText(/kaboom/i)).not.toBeInTheDocument();
  });

  it("logs structured error context to console.error", () => {
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom when />
      </ErrorBoundary>
    );
    const matched = spy.mock.calls.some(
      (call) =>
        call[0] === "[ui] render error" &&
        typeof call[1] === "object" &&
        call[1] !== null &&
        (call[1] as { message?: string }).message === "kaboom"
    );
    expect(matched).toBe(true);
  });

  it("renders the custom fallback and resets when reset is invoked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Toggle />);
    expect(screen.getByText(/caught: kaboom/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /recover/i }));
    expect(screen.getByText("safe content")).toBeInTheDocument();
  });
});
