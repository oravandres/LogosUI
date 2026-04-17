import type { CSSProperties, ReactNode } from "react";

type SkeletonVariant = "text" | "rect" | "circle";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: SkeletonVariant;
  className?: string;
  /** Accessibility: by default skeletons are decorative. Set a label to surface
   *  a screen-reader-only description (wraps in `role="status" aria-live="polite"`). */
  ariaLabel?: string;
  /**
   * When true, render as a block-level element. Required when `width` is a
   * percentage (e.g. `"100%"`), because the default live-region wrapper is
   * `inline-block` and percentage sizing resolves against a shrink-to-fit
   * parent, collapsing the skeleton to 0. In block mode the wrapper takes
   * the requested size and the inner shimmer fills it.
   */
  block?: boolean;
}

function toCssSize(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

/**
 * Visual placeholder block with a subtle pulse animation. Respects
 * `prefers-reduced-motion` via CSS. Decorative by default
 * (`aria-hidden="true"`); surrounding containers should own the live-region
 * announcement for "loading" state.
 */
export function Skeleton({
  width,
  height,
  variant = "rect",
  className,
  ariaLabel,
  block = false,
}: SkeletonProps) {
  const w = toCssSize(width);
  const h = toCssSize(height);

  const classes = ["skeleton", `skeleton-${variant}`];
  if (className) classes.push(className);

  // In block mode the wrapper (if any) owns the requested size so percentage
  // widths resolve against the actual layout parent; the inner shimmer fills
  // the wrapper. In inline mode the inner shimmer owns the size as before.
  const outerStyle: CSSProperties | undefined = block
    ? { width: w, height: h }
    : undefined;
  const innerStyle: CSSProperties | undefined = block
    ? { width: "100%", height: "100%" }
    : w !== undefined || h !== undefined
      ? { width: w, height: h }
      : undefined;

  if (ariaLabel) {
    const Wrapper = block ? "div" : "span";
    const wrapperClasses = block
      ? "skeleton-live skeleton-live-block"
      : "skeleton-live";
    // `role="status"` uses nameFrom="author", so descendant text does not
    // become the accessible name — use `aria-label` on the wrapper directly.
    return (
      <Wrapper
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        className={wrapperClasses}
        style={outerStyle}
      >
        <span className={classes.join(" ")} style={innerStyle} aria-hidden="true" />
      </Wrapper>
    );
  }
  if (block) {
    return (
      <div className="skeleton-block" style={outerStyle} aria-hidden="true">
        <span className={classes.join(" ")} style={innerStyle} />
      </div>
    );
  }
  return <span className={classes.join(" ")} style={innerStyle} aria-hidden="true" />;
}

/**
 * Renders a handful of stacked skeleton rows mimicking a list/table body.
 * The surrounding container should announce the loading state (e.g. the
 * panel's `aria-busy`).
 */
export function ListSkeleton({
  rows = 5,
  ariaLabel = "Loading",
}: {
  rows?: number;
  ariaLabel?: string;
}): ReactNode {
  return (
    <div
      className="list-skeleton"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="list-skeleton-row" aria-hidden="true">
          <span className="skeleton skeleton-rect list-skeleton-primary" />
          <span className="skeleton skeleton-rect list-skeleton-secondary" />
        </div>
      ))}
    </div>
  );
}
