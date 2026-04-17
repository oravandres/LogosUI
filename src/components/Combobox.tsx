import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type ComboboxOption = {
  /** Value committed to `onSelect` when this row is picked. */
  value: string;
  /** Visible text for the option. Used as the default rendering and as the
   *  fallback for `aria-label`-style text content. */
  label: string;
  /** Optional renderer that overrides the plain `label` text. */
  render?: () => ReactNode;
};

export type ComboboxProps = {
  /** Options to render. The parent is responsible for filtering. */
  options: ComboboxOption[];
  /** Currently committed value (`""` means no selection). Used to mark the
   *  selected row. Does **not** drive the input text — pass `displayValue`
   *  for that. */
  value: string;
  /** Called when the user commits an option (Enter on the active row, click,
   *  or `onMouseDown` on a row). */
  onSelect: (value: string) => void;
  /** Controlled query text shown in the input while open. */
  query: string;
  /** Called as the user types in the input. Parents typically use this to
   *  drive a search and update the visible `options`. */
  onQueryChange: (query: string) => void;
  /** Text shown in the input when the listbox is closed (e.g. the resolved
   *  display name of the currently selected value, or `""` for "nothing
   *  selected"). */
  displayValue: string;
  /** Open state (controlled). Pair with `onOpenChange`. */
  isOpen: boolean;
  /** Called when the open state should change (focus, blur, Escape, commit,
   *  Arrow opening a closed listbox). */
  onOpenChange: (open: boolean) => void;
  /** Required for accessibility — the input's accessible name. */
  ariaLabel: string;
  /** Placeholder shown when the listbox is closed. */
  placeholder?: string;
  /** Placeholder shown while the listbox is open (typically a "Type a name…"
   *  hint). Defaults to `placeholder`. */
  openPlaceholder?: string;
  disabled?: boolean;
  /** Mirrors `aria-busy` on the input — true while the parent is loading
   *  results for the current query. */
  isBusy?: boolean;
  /** Use tighter styling for toolbars / inline-edit rows. */
  compact?: boolean;
  /** Optional content rendered above the option list (typically a status
   *  message, e.g. "Loading…" or "Failed to load. Keep typing to retry."). */
  listboxHeader?: ReactNode;
  /** Optional content rendered below the option list (e.g. a "Showing top N
   *  of M" hint). */
  listboxFooter?: ReactNode;
  /** Optional content rendered when `options.length === 0`. Sits below
   *  `listboxHeader`. */
  emptyState?: ReactNode;
};

/**
 * Generic searchable combobox primitive. Owns the keyboard contract,
 * `aria-activedescendant` wiring, scroll-into-view, and selection commit.
 *
 * Data fetching, option building, and "display value when closed" are the
 * parent's concern — this component only renders what it is given.
 *
 * Accessibility contract (matches the WAI-ARIA combobox pattern):
 * - `role="combobox"` input with `aria-expanded`, `aria-controls`,
 *   `aria-autocomplete="list"`, and `aria-activedescendant` pointing at the
 *   active option's DOM id.
 * - `ArrowDown` / `ArrowUp` move the active option (with wrap-around) and
 *   open a closed listbox.
 * - `Home` / `End` jump to the first / last option.
 * - `Enter` commits the active option.
 * - `Escape` closes the listbox without committing.
 * - Mouse hover updates the active option so pointer and keyboard stay in
 *   sync; the active option is scrolled into view as the user arrows.
 * - Selection is committed on `onMouseDown` with `preventDefault` so the
 *   click is not first swallowed by the input blur tearing the listbox down.
 */
export function Combobox({
  options,
  value,
  onSelect,
  query,
  onQueryChange,
  displayValue,
  isOpen,
  onOpenChange,
  ariaLabel,
  placeholder,
  openPlaceholder,
  disabled = false,
  isBusy = false,
  compact = false,
  listboxHeader,
  listboxFooter,
  emptyState,
}: ComboboxProps) {
  const autoId = useId();
  const listboxId = `${autoId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const [activeIndex, setActiveIndex] = useState(0);

  // Stable DOM ids for each row, keyed by position within the listbox. We
  // intentionally do not derive these from `opt.value`: the committed value
  // is an opaque consumer-supplied string (e.g. an author id), so overloading
  // it as an id-namespace would collide when two options share a value, when
  // the value is empty, or when a consumer has a legitimate `"none"` option.
  const optionDomIds = useMemo(
    () => options.map((_, i) => `${autoId}-opt-${i}`),
    // Only the count matters — ids are position-based and decoupled from
    // option identity, so reshuffling the same-length list must not change
    // the id array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoId, options.length]
  );

  // Reset the active option whenever the option set or open state changes.
  // We do this in a single effect (rather than two) so the active index can
  // never dangle past the end of a shrinking option set.
  useEffect(() => {
    if (!isOpen) return;
    if (options.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((i) => {
      if (i < 0) return 0;
      if (i >= options.length) return options.length - 1;
      return i;
    });
  }, [isOpen, options.length]);

  // Reset to the first option when the query changes (parent typically
  // re-fetches options on query change, but a stale active index would keep
  // pointing at whatever was at that position before).
  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(options.length > 0 ? 0 : -1);
    // We intentionally depend on `query`, not on `options`, so a background
    // refetch with the same query does not yank the active option back to
    // the top while the user is arrowing around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Keep the active option scrolled into view as the user arrows around.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const id = optionDomIds[activeIndex];
    if (!id) return;
    const el = listboxRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(id)}`
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen, optionDomIds]);

  const commit = (selected: string) => {
    onSelect(selected);
    onOpenChange(false);
    onQueryChange("");
    inputRef.current?.blur();
  };

  const onInputKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Escape") {
      if (isOpen) {
        ev.preventDefault();
        inputRef.current?.blur();
      }
      return;
    }

    if (!isOpen) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        onOpenChange(true);
      }
      return;
    }

    switch (ev.key) {
      case "ArrowDown": {
        ev.preventDefault();
        setActiveIndex((i) => {
          if (options.length === 0) return -1;
          return (i + 1) % options.length;
        });
        return;
      }
      case "ArrowUp": {
        ev.preventDefault();
        setActiveIndex((i) => {
          if (options.length === 0) return -1;
          return (i - 1 + options.length) % options.length;
        });
        return;
      }
      case "Home": {
        if (options.length > 0) {
          ev.preventDefault();
          setActiveIndex(0);
        }
        return;
      }
      case "End": {
        if (options.length > 0) {
          ev.preventDefault();
          setActiveIndex(options.length - 1);
        }
        return;
      }
      case "Enter": {
        if (activeIndex >= 0 && activeIndex < options.length) {
          ev.preventDefault();
          commit(options[activeIndex].value);
        }
        return;
      }
    }
  };

  const activeDescendantId =
    isOpen && activeIndex >= 0 && activeIndex < options.length
      ? optionDomIds[activeIndex]
      : undefined;

  const inputDisplay = isOpen ? query : displayValue;
  const effectiveOpenPlaceholder = openPlaceholder ?? placeholder;
  const rootClass = compact ? "combobox combobox-compact" : "combobox";
  const inputClass = compact ? "input input-compact" : "input";

  return (
    <div className={rootClass}>
      <input
        ref={inputRef}
        className={inputClass}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendantId}
        aria-busy={isOpen && isBusy}
        placeholder={isOpen ? effectiveOpenPlaceholder : placeholder}
        value={inputDisplay}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          onOpenChange(true);
          onQueryChange("");
        }}
        onBlur={() => {
          onOpenChange(false);
          onQueryChange("");
        }}
        onChange={(ev) => onQueryChange(ev.target.value)}
        onKeyDown={onInputKeyDown}
      />
      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          ref={listboxRef}
          className="combobox-listbox"
        >
          {listboxHeader}
          {options.map((opt, i) => {
            const isSelected = value === opt.value;
            const isActive = i === activeIndex;
            const classes = ["combobox-option"];
            if (isSelected) classes.push("combobox-option-selected");
            if (isActive) classes.push("combobox-option-active");
            return (
              <li
                key={optionDomIds[i]}
                id={optionDomIds[i]}
                role="option"
                aria-selected={isSelected}
                className={classes.join(" ")}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  commit(opt.value);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {opt.render ? opt.render() : opt.label}
              </li>
            );
          })}
          {options.length === 0 ? emptyState : null}
          {listboxFooter}
        </ul>
      ) : null}
    </div>
  );
}
