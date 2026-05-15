import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs, type TabItem } from "./Tabs";

function Harness({
  initial = "first",
  activation,
  items,
}: {
  initial?: string;
  activation?: "automatic" | "manual";
  items?: TabItem[];
}) {
  const [value, setValue] = useState(initial);
  const tabs: TabItem[] = items ?? [
    { id: "first", label: "First", panel: <p>First panel</p> },
    { id: "second", label: "Second", panel: <p>Second panel</p> },
    { id: "third", label: "Third", panel: <p>Third panel</p> },
  ];
  return (
    <Tabs
      ariaLabel="Sample tabs"
      value={value}
      onChange={setValue}
      items={tabs}
      activation={activation}
    />
  );
}

describe("Tabs", () => {
  it("exposes a tablist with one tab per item and one tabpanel for the active tab", () => {
    render(<Harness />);
    expect(
      screen.getByRole("tablist", { name: /sample tabs/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    // Only the active panel renders.
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      expect.stringContaining("first")
    );
    expect(screen.getByText("First panel")).toBeInTheDocument();
  });

  it("activates a tab on click and reveals its panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "Second" }));
    expect(screen.getByRole("tab", { name: "Second" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("Second panel")).toBeInTheDocument();
    expect(screen.queryByText("First panel")).not.toBeInTheDocument();
  });

  it("ArrowRight in automatic activation moves focus AND selection (with wrap)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "First" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Second" })).toHaveFocus();
    expect(screen.getByText("Second panel")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Third panel")).toBeInTheDocument();
    // Wrap to the first.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("First panel")).toBeInTheDocument();
  });

  it("ArrowLeft wraps to the last tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "First" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Third" })).toHaveFocus();
    expect(screen.getByText("Third panel")).toBeInTheDocument();
  });

  it("Home and End jump to the first / last tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "First" }).focus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Third" })).toHaveFocus();
    expect(screen.getByText("Third panel")).toBeInTheDocument();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "First" })).toHaveFocus();
    expect(screen.getByText("First panel")).toBeInTheDocument();
  });

  it("manual activation moves focus on Arrow* without changing selection until Enter", async () => {
    const user = userEvent.setup();
    render(<Harness activation="manual" />);
    screen.getByRole("tab", { name: "First" }).focus();
    await user.keyboard("{ArrowRight}");
    // Focus moved to "Second" but the active panel must still be "First".
    expect(screen.getByRole("tab", { name: "Second" })).toHaveFocus();
    expect(screen.getByText("First panel")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Second panel")).toBeInTheDocument();
  });

  it("disabled tabs are skipped during arrow navigation", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        items={[
          { id: "a", label: "A", panel: <p>A panel</p> },
          { id: "b", label: "B", panel: <p>B panel</p>, disabled: true },
          { id: "c", label: "C", panel: <p>C panel</p> },
        ]}
        initial="a"
      />
    );
    screen.getByRole("tab", { name: "A" }).focus();
    await user.keyboard("{ArrowRight}");
    // B is disabled, so focus must skip it and land on C.
    expect(screen.getByRole("tab", { name: "C" })).toHaveFocus();
    expect(screen.getByText("C panel")).toBeInTheDocument();
  });

  it("only the active tab participates in the tab order (roving tabindex)", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    expect(tabs[2]).toHaveAttribute("tabindex", "-1");
  });
});
