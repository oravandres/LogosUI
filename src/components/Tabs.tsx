import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/**
 * Public option for a Tabs item: id is the stable identifier the parent
 * uses to drive the controlled `value` / `onChange` pair, label is the
 * visible text on the tab, and `panel` is the content rendered when the
 * tab is active.
 */
export type TabItem = {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  /**
   * Optional disabled flag. Disabled tabs are still focusable so that
   * arrow-key navigation does not "skip-trap" past them, but pressing
   * Enter / Space does not select. WAI-ARIA Authoring Practices treat
   * disabled tabs as part of the visible tab set; we follow that.
   */
  disabled?: boolean;
};

export type TabsProps = {
  /** Stable id of the active tab. The parent owns this state. */
  value: string;
  /** Called when the user commits a tab (click, Enter, Space, or
   *  arrow-navigation if `activation === "automatic"`). */
  onChange: (id: string) => void;
  /** The full tab set. Tab order is the array order. */
  items: TabItem[];
  /**
   * Tab activation model:
   *   - "automatic" (default): focusing a tab via ArrowLeft/ArrowRight
   *     also activates it. Best for tabs whose panels render quickly.
   *   - "manual": arrow keys move focus only; Enter / Space activates.
   *     Use when activating a tab is expensive (e.g. mounts a panel
   *     that does its own data fetching).
   */
  activation?: "automatic" | "manual";
  /** Required accessible name for the tablist. */
  ariaLabel: string;
  /** Optional className applied to the root container. */
  className?: string;
};

/**
 * Tabs is a small accessible primitive for a tablist + panels.
 *
 * Why a custom primitive instead of a third-party combobox / tabs
 * library? Two reasons:
 *
 *  1. We already accept the WAI-ARIA Authoring-Practices tab pattern as
 *     a project rule (see `.cursor/rules/12-pr-review-lessons.mdc`,
 *     "Pickers, dropdowns, and large collections" – which calls out
 *     "implement once, compose elsewhere"). Tabs are the same shape:
 *     `role="tablist"` + `role="tab"` + `role="tabpanel"`, with
 *     keyboard nav. Implementing it once keeps the contract under our
 *     control and avoids a runtime dependency.
 *
 *  2. The next consumer (Register Image panel in `ImagesPage`) only
 *     needs two tabs and the simplest possible API. A library would
 *     pull in extra abstractions we wouldn't use.
 *
 * Keyboard contract (matches WAI-ARIA APG):
 *
 *   ArrowLeft / ArrowRight  — move focus to the previous / next enabled
 *                             tab (wraps).
 *   Home / End              — focus the first / last enabled tab.
 *   Enter / Space           — activate the focused tab (when activation
 *                             is "manual"; under "automatic" the tab is
 *                             already active because focus implies
 *                             selection).
 *
 * The keyboard handler is intentionally compact: Tabs is one of the
 * cheapest interactions in the app and the entire component should fit
 * on one screen for review.
 */
export function Tabs({
  value,
  onChange,
  items,
  activation = "automatic",
  ariaLabel,
  className,
}: TabsProps) {
  const baseId = useId();
  // Track each tab button DOM node so keyboard navigation can move focus
  // synchronously without round-tripping through React state.
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeIndex = items.findIndex((t) => t.id === value);

  // Always keep the active tab in the ref map (dead-tab cleanup).
  useEffect(() => {
    const ids = new Set(items.map((t) => t.id));
    const refs = tabRefs.current;
    refs.forEach((_, id) => {
      if (!ids.has(id)) refs.delete(id);
    });
  }, [items]);

  const focusTabAt = useCallback(
    (idx: number) => {
      const target = items[idx];
      if (!target) return;
      const node = tabRefs.current.get(target.id);
      if (node) node.focus();
    },
    [items]
  );

  const findEnabled = useCallback(
    (start: number, dir: 1 | -1) => {
      const n = items.length;
      if (n === 0) return -1;
      // Walk at most n positions so a fully-disabled tablist is a
      // tight no-op rather than an infinite loop.
      for (let step = 1; step <= n; step++) {
        const idx = (start + dir * step + n) % n;
        if (!items[idx].disabled) return idx;
      }
      return -1;
    },
    [items]
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;
    const current = activeIndex >= 0 ? activeIndex : 0;
    let nextIndex = -1;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = findEnabled(current, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = findEnabled(current, -1);
        break;
      case "Home":
        nextIndex = findEnabled(-1, 1);
        break;
      case "End":
        nextIndex = findEnabled(items.length, -1);
        break;
      case "Enter":
      case " ": {
        // Activation under either model: Enter / Space commits the
        // currently focused tab. Under "automatic" focus already
        // matches selection, so this is a no-op there.
        const focused = document.activeElement;
        if (focused instanceof HTMLButtonElement) {
          const id = focused.dataset.tabId;
          if (id && id !== value && items.some((t) => t.id === id && !t.disabled)) {
            e.preventDefault();
            onChange(id);
          }
        }
        return;
      }
      default:
        return;
    }

    if (nextIndex < 0) return;
    e.preventDefault();
    focusTabAt(nextIndex);
    if (activation === "automatic") {
      const nextItem = items[nextIndex];
      if (nextItem.id !== value) onChange(nextItem.id);
    }
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="tablist"
        onKeyDown={onKeyDown}
      >
        {items.map((tab) => {
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          const isActive = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId}
              data-tab-id={tab.id}
              aria-selected={isActive}
              aria-controls={panelId}
              aria-disabled={tab.disabled || undefined}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              className={isActive ? "tab tab-active" : "tab"}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              onClick={() => {
                if (tab.disabled) return;
                if (tab.id !== value) onChange(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {items.map((tab) => {
        const tabId = `${baseId}-tab-${tab.id}`;
        const panelId = `${baseId}-panel-${tab.id}`;
        const isActive = tab.id === value;
        // Render only the active panel. Pre-mounting hidden panels with
        // `hidden` is sometimes preferred for cheap state preservation,
        // but this primitive covers the simple case where each panel is
        // a small form that can mount/unmount cheaply. Consumers that
        // need persisted state across tab changes can lift state up.
        if (!isActive) return null;
        return (
          <div
            key={tab.id}
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId}
            tabIndex={0}
            className="tabpanel"
          >
            {tab.panel}
          </div>
        );
      })}
    </div>
  );
}
