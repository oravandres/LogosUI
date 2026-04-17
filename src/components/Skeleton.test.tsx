import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListSkeleton, Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders a decorative block with the skeleton class and aria-hidden by default", () => {
    const { container } = render(<Skeleton width="4rem" height="1rem" />);
    const el = container.querySelector(".skeleton");
    expect(el).not.toBeNull();
    expect(el).toHaveClass("skeleton-rect");
    expect(el).toHaveAttribute("aria-hidden", "true");
    const style = (el as HTMLElement).style;
    expect(style.width).toBe("4rem");
    expect(style.height).toBe("1rem");
  });

  it("wraps with a polite live region and screen-reader label when ariaLabel is provided", () => {
    render(<Skeleton ariaLabel="Loading total" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading total");
  });

  it("supports the circle variant", () => {
    const { container } = render(<Skeleton variant="circle" width={32} height={32} />);
    const el = container.querySelector(".skeleton");
    expect(el).toHaveClass("skeleton-circle");
    expect((el as HTMLElement).style.width).toBe("32px");
  });
});

describe("ListSkeleton", () => {
  it("renders the requested number of rows inside a polite live region", () => {
    const { container } = render(<ListSkeleton rows={3} />);
    const status = screen.getByRole("status", { name: /loading/i });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(container.querySelectorAll(".list-skeleton-row")).toHaveLength(3);
  });

  it("uses the provided aria-label", () => {
    render(<ListSkeleton rows={1} ariaLabel="Loading categories" />);
    expect(
      screen.getByRole("status", { name: "Loading categories" })
    ).toBeInTheDocument();
  });
});
