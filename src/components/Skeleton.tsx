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
}: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;

  const classes = ["skeleton", `skeleton-${variant}`];
  if (className) classes.push(className);

  if (ariaLabel) {
    return (
      <span role="status" aria-live="polite" className="skeleton-live">
        <span className={classes.join(" ")} style={style} aria-hidden="true" />
        <span className="visually-hidden">{ariaLabel}</span>
      </span>
    );
  }
  return <span className={classes.join(" ")} style={style} aria-hidden="true" />;
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
