import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

function Boom(): never {
  throw new Error("kaboom");
}

function Safe() {
  return <p>safe page</p>;
}

describe("Layout", () => {
  it("recovers after navigating away from a crashing route", async () => {
    // React logs caught errors; silence it so test output stays readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/broken" element={<Boom />} />
            <Route path="/" element={<Safe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /something went wrong/i })
    ).toBeInTheDocument();

    // The nav must still be rendered inside Layout — navigation away should
    // clear the boundary (it's keyed by location) and show the new route.
    await user.click(screen.getByRole("link", { name: /^home$/i }));

    expect(screen.getByText("safe page")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /something went wrong/i })
    ).not.toBeInTheDocument();

    spy.mockRestore();
  });
});
