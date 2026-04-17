import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title, description, and action children", () => {
    render(
      <EmptyState title="No items yet" description="Create your first item.">
        <button type="button">Create</button>
      </EmptyState>
    );
    expect(
      screen.getByRole("heading", { level: 4, name: /no items yet/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/create your first item/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
  });

  it("omits sections that aren't provided", () => {
    const { container } = render(<EmptyState title="Nothing" />);
    expect(container.querySelector(".empty-state-description")).toBeNull();
    expect(container.querySelector(".empty-state-actions")).toBeNull();
  });
});
