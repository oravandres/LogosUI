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

  it("wraps with a polite live region and an aria-label when ariaLabel is provided", () => {
    render(<Skeleton ariaLabel="Loading total" />);
    // `role="status"` uses nameFrom="author"; the accessible name must come
    // from aria-label (or aria-labelledby), not descendant text.
    const status = screen.getByRole("status", { name: "Loading total" });
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("supports the circle variant", () => {
    const { container } = render(<Skeleton variant="circle" width={32} height={32} />);
    const el = container.querySelector(".skeleton");
    expect(el).toHaveClass("skeleton-circle");
    expect((el as HTMLElement).style.width).toBe("32px");
  });

  it("in block mode the live-region wrapper takes the requested size so percentage widths resolve against the layout parent", () => {
    const { container } = render(
      <Skeleton
        width="100%"
        height="12rem"
        ariaLabel="Loading image"
        block
      />
    );
    // Wrapper is a <div role="status"> so it participates in block layout.
    const wrapper = container.querySelector(".skeleton-live-block");
    expect(wrapper).not.toBeNull();
    expect((wrapper as HTMLElement).tagName).toBe("DIV");
    expect((wrapper as HTMLElement).style.width).toBe("100%");
    expect((wrapper as HTMLElement).style.height).toBe("12rem");
    // Inner shimmer fills the wrapper (no explicit percentage resolved against
    // a shrink-to-fit ancestor).
    const inner = wrapper!.querySelector(".skeleton") as HTMLElement;
    expect(inner.style.width).toBe("100%");
    expect(inner.style.height).toBe("100%");
  });

  it("in block mode without a label still renders a block wrapper and keeps the content aria-hidden", () => {
    const { container } = render(<Skeleton width="100%" height="4rem" block />);
    const wrapper = container.querySelector(".skeleton-block") as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.style.width).toBe("100%");
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
