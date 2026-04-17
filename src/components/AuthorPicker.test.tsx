import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorPicker } from "./AuthorPicker";

const listAuthorsMock = vi.fn();
const getAuthorMock = vi.fn();

vi.mock("@/api/authors", () => ({
  listAuthors: (...args: unknown[]) => listAuthorsMock(...args),
  getAuthor: (...args: unknown[]) => getAuthorMock(...args),
}));

function Harness({
  initialValue = "",
  allowNone = false,
  onChange,
}: {
  initialValue?: string;
  allowNone?: boolean;
  onChange?: (id: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <AuthorPicker
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      allowNone={allowNone}
      ariaLabel="Author"
    />
  );
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("AuthorPicker", () => {
  beforeEach(() => {
    listAuthorsMock.mockReset();
    getAuthorMock.mockReset();
  });

  // Regression: author ids are opaque backend strings. An earlier version
  // reserved `__none__` as a synthetic sentinel in that namespace, which
  // made a real author with that id impossible to select (both the clear row
  // and the real row collapsed to the same option, and `onSelect` round-
  // tripped `__none__` back to `""`). The picker must not invent sentinels
  // in the backend id space.
  it("selects a real author whose id happens to be `__none__`", async () => {
    listAuthorsMock.mockResolvedValue({
      items: [{ id: "__none__", name: "Edge Case Author" }],
      total: 1,
      offset: 0,
      limit: 20,
    });
    getAuthorMock.mockResolvedValue({ id: "__none__", name: "Edge Case Author" });

    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<Harness allowNone onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "Author" });
    await user.click(input);

    const opts = await screen.findAllByRole("option");
    // With allowNone, row 0 is the clear row and row 1 is the real author.
    expect(opts).toHaveLength(2);
    expect(
      within(opts[0]).getByText(/all authors/i)
    ).toBeInTheDocument();
    expect(opts[1]).toHaveTextContent("Edge Case Author");

    await user.click(opts[1]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("__none__");
  });

  // The clear row must round-trip to `""` — the public "no selection" value.
  it("clears the selection when the user picks the `allowNone` row", async () => {
    getAuthorMock.mockResolvedValue({ id: "auth-1", name: "Aristotle" });
    listAuthorsMock.mockResolvedValue({
      items: [{ id: "auth-1", name: "Aristotle" }],
      total: 1,
      offset: 0,
      limit: 20,
    });

    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <Harness initialValue="auth-1" allowNone onChange={onChange} />
    );

    const input = screen.getByRole("combobox", { name: "Author" });
    await user.click(input);
    const clearRow = await screen.findByRole("option", {
      name: /all authors/i,
    });
    await user.click(clearRow);

    expect(onChange).toHaveBeenCalledWith("");
  });
});
