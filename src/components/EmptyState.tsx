import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Short heading, e.g. "No categories yet". Rendered as an h4. */
  title?: string;
  /** Explanation and/or CTA copy. Plain text or React. */
  description?: ReactNode;
  /** Optional action row (e.g. a primary button + clear-filters link). */
  children?: ReactNode;
}

/**
 * Friendly empty-state panel for list views. Callers supply the copy and any
 * action buttons, so pages can offer context-appropriate CTAs (create vs
 * clear-filters) without this component needing to know about routing or
 * form refs.
 */
export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {title ? <h4 className="empty-state-title">{title}</h4> : null}
      {description ? (
        <p className="empty-state-description">{description}</p>
      ) : null}
      {children ? <div className="empty-state-actions">{children}</div> : null}
    </div>
  );
}
