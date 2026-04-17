import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "./Combobox";

type HarnessProps = {
  options?: ComboboxOption[];
  initialValue?: string;
  onSelect?: (value: string) => void;
  ariaLabel?: string;
  emptyState?: React.ReactNode;
  listboxHeader?: React.ReactNode;
  listboxFooter?: React.ReactNode;
  isBusy?: boolean;
  disabled?: boolean;
};

function makeOptions(n: number): ComboboxOption[] {
  return Array.from({ length: n }, (_, i) => ({
    value: `id-${i + 1}`,
    label: `Option ${i + 1}`,
  }));
}

/**
 * Minimal controlled wrapper that owns `query`, `isOpen`, and `value` state,
 * matching how real consumers wire the primitive.
 */
function Harness({
  options = makeOptions(3),
  initialValue = "",
  onSelect,
  ariaLabel = "Picker",
  emptyState,
  listboxHeader,
  listboxFooter,
  isBusy,
  disabled,
}: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Combobox
      options={options}
      value={value}
      onSelect={(v) => {
        setValue(v);
        onSelect?.(v);
      }}
      query={query}
      onQueryChange={setQuery}
      displayValue={selected?.label ?? ""}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      ariaLabel={ariaLabel}
      placeholder="Search…"
      openPlaceholder="Type a name…"
      emptyState={emptyState}
      listboxHeader={listboxHeader}
      listboxFooter={listboxFooter}
      isBusy={isBusy}
      disabled={disabled}
    />
  );
}

describe("Combobox", () => {
  it("opens the listbox on focus and exposes ARIA combobox attributes", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-controls");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(listbox.id).toBe(input.getAttribute("aria-controls"));
    expect(within(listbox).getAllByRole("option")).toHaveLength(3);
  });

  it("activates the first option on open and tracks aria-activedescendant", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);

    const opts = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", opts[0].id);
    expect(opts[0]).toHaveClass("combobox-option-active");
  });

  it("ArrowDown / ArrowUp move the active option with wrap-around", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", opts[1].id);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", opts[0].id);

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", opts[2].id);
  });

  it("Home / End jump to the first / last option", async () => {
    const user = userEvent.setup();
    render(<Harness options={makeOptions(5)} />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");

    await user.keyboard("{End}");
    expect(input).toHaveAttribute("aria-activedescendant", opts[4].id);

    await user.keyboard("{Home}");
    expect(input).toHaveAttribute("aria-activedescendant", opts[0].id);
  });

  it("Enter commits the active option (not the first option)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("id-3");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ArrowDown opens a parent-closed listbox while focused", async () => {
    const onOpenChange = vi.fn();

    // Parent that keeps `isOpen` permanently false to isolate the
    // "ArrowDown reopens a focused-but-closed listbox" path. The primitive
    // should call `onOpenChange(true)` even though the prop never flips.
    function ForcedClosedHarness() {
      const [query, setQuery] = useState("");
      return (
        <Combobox
          options={makeOptions(3)}
          value=""
          onSelect={() => {}}
          query={query}
          onQueryChange={setQuery}
          displayValue=""
          isOpen={false}
          onOpenChange={onOpenChange}
          ariaLabel="Picker"
        />
      );
    }

    render(<ForcedClosedHarness />);
    const input = screen.getByRole("combobox", { name: "Picker" });
    input.focus();
    onOpenChange.mockClear();

    const user = userEvent.setup();
    await user.keyboard("{ArrowDown}");
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the listbox without committing", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    await user.keyboard("{Escape}");

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("commits via mouse click without first blurring the input", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");

    await user.click(opts[1]);
    expect(onSelect).toHaveBeenCalledWith("id-2");
  });

  it("hovering an option syncs the active index with the pointer", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");

    await user.hover(opts[2]);
    expect(input).toHaveAttribute("aria-activedescendant", opts[2].id);
    expect(opts[2]).toHaveClass("combobox-option-active");
  });

  it("renders custom option content via the `render` callback", async () => {
    const user = userEvent.setup();
    const options: ComboboxOption[] = [
      {
        value: "",
        label: "All authors",
        render: () => <span className="muted">All authors</span>,
      },
      { value: "a", label: "Aristotle" },
    ];
    render(<Harness options={options} />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);

    const noneRow = within(screen.getByRole("listbox")).getByText(
      "All authors"
    );
    expect(noneRow).toHaveClass("muted");
  });

  it("renders header, footer, and empty-state slots", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        options={[]}
        listboxHeader={
          <li role="status" className="combobox-status muted">
            Loading…
          </li>
        }
        emptyState={
          <li className="combobox-status muted">No matches.</li>
        }
        listboxFooter={
          <li className="combobox-status muted">Showing top 0 of 0.</li>
        }
      />
    );

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.getByText("No matches.")).toBeInTheDocument();
    expect(screen.getByText("Showing top 0 of 0.")).toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("marks the option whose value matches `value` as aria-selected", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue="id-2" />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");

    expect(opts[0]).toHaveAttribute("aria-selected", "false");
    expect(opts[1]).toHaveAttribute("aria-selected", "true");
    expect(opts[1]).toHaveClass("combobox-option-selected");
  });

  it("forwards `disabled` to the input", () => {
    render(<Harness disabled />);
    expect(screen.getByRole("combobox", { name: "Picker" })).toBeDisabled();
  });

  it("mirrors `isBusy` onto aria-busy while open", async () => {
    const user = userEvent.setup();
    render(<Harness isBusy />);
    const input = screen.getByRole("combobox", { name: "Picker" });
    expect(input).toHaveAttribute("aria-busy", "false");
    await user.click(input);
    expect(input).toHaveAttribute("aria-busy", "true");
  });

  it("typing forwards to onQueryChange and shows the typed text in the input", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", {
      name: "Picker",
    }) as HTMLInputElement;
    await user.click(input);
    await user.type(input, "Pla");
    expect(input.value).toBe("Pla");
  });

  // Regression: closing the listbox and reopening it must reset the active
  // option to the first row. An earlier version only clamped the previous
  // `activeIndex`, so ArrowDown to row 3 → Escape → reopen → Enter committed
  // the stale row 3 instead of row 1. Future pickers compose this primitive
  // and would silently inherit that bug.
  it("resets the active option to the first row on every reopen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness options={makeOptions(5)} onSelect={onSelect} />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", opts[2].id);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(input);
    const reopened = within(screen.getByRole("listbox")).getAllByRole(
      "option"
    );
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      reopened[0].id
    );
    expect(reopened[0]).toHaveClass("combobox-option-active");

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("id-1");
  });

  // Regression: DOM ids must not be derived from the committed `value`. A
  // clearable combobox has a row with `value=""` alongside regular rows, and
  // consumers can legitimately have an option with `value="none"`. Earlier
  // versions collapsed both into the same `"-opt-none"` id, which produced
  // duplicate DOM ids, duplicate React keys, and ambiguous
  // `aria-activedescendant` targets.
  it("assigns a unique DOM id to each option even when values are empty or collide with prior sentinels", async () => {
    const user = userEvent.setup();
    const options: ComboboxOption[] = [
      { value: "", label: "All" },
      { value: "none", label: "Literal none" },
      { value: "a", label: "Aristotle" },
    ];
    render(<Harness options={options} />);

    const input = screen.getByRole("combobox", { name: "Picker" });
    await user.click(input);
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");
    const ids = opts.map((o) => o.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Boolean)).toBe(true);

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", ids[1]);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", ids[2]);
  });
});
