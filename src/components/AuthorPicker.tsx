import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { getAuthor, listAuthors } from "@/api/authors";

const DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 20;

export type AuthorPickerProps = {
  /** Selected author id, or `""` for no selection. */
  value: string;
  onChange: (id: string) => void;
  /** When true, the listbox shows an "All authors" option that clears the value. */
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  /** Use tighter styling for toolbars / inline-edit rows. */
  compact?: boolean;
};

type PickerOption = {
  /** DOM id, referenced by `aria-activedescendant`. */
  elementId: string;
  /** Underlying author id to commit on selection (`""` for the none option). */
  valueId: string;
  label: string;
  isNone: boolean;
};

/**
 * Searchable, keyboard-operable author picker backed by
 * `GET /authors?name=<substring>`.
 *
 * Unlike a bounded `<select>` (which caps visibility to the first page of
 * authors), this combobox issues a fresh, debounced query as the user types,
 * so any author is selectable regardless of dataset size. The current value
 * is resolved to a display name via `getAuthor` so the input shows the
 * current selection even when the author is outside the latest search page.
 *
 * Accessibility:
 * - `role="combobox"` input with `aria-expanded`, `aria-controls`,
 *   `aria-autocomplete="list"`, and `aria-activedescendant` tracking the
 *   active option.
 * - Full keyboard support: ArrowDown/ArrowUp move the active option (with
 *   wrap-around), Home/End jump to the ends, Enter commits the active
 *   option, Escape closes. ArrowDown/ArrowUp also open the listbox when
 *   it is closed.
 * - `onMouseDown` with `preventDefault` commits selections without first
 *   blurring the input and swallowing the click.
 */
export function AuthorPicker({
  value,
  onChange,
  allowNone = false,
  noneLabel = "All authors",
  disabled = false,
  placeholder = "Search authors by name…",
  ariaLabel,
  compact = false,
}: AuthorPickerProps) {
  const autoId = useId();
  const listboxId = `${autoId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      DEBOUNCE_MS
    );
    return () => window.clearTimeout(t);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["authors", "picker-search", debouncedQuery],
    queryFn: ({ signal }) =>
      listAuthors({ name: debouncedQuery, limit: SEARCH_LIMIT, signal }),
    enabled: isOpen,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const resolveQuery = useQuery({
    queryKey: ["authors", "picker-resolve", value],
    queryFn: ({ signal }) => getAuthor(value, signal),
    enabled: value !== "",
    staleTime: 60_000,
  });

  const items = useMemo(
    () => searchQuery.data?.items ?? [],
    [searchQuery.data]
  );
  const total = searchQuery.data?.total ?? 0;

  const options: PickerOption[] = useMemo(() => {
    const opts: PickerOption[] = [];
    if (allowNone) {
      opts.push({
        elementId: `${autoId}-opt-none`,
        valueId: "",
        label: noneLabel,
        isNone: true,
      });
    }
    for (const a of items) {
      opts.push({
        elementId: `${autoId}-opt-${a.id}`,
        valueId: a.id,
        label: a.name,
        isNone: false,
      });
    }
    return opts;
  }, [allowNone, autoId, items, noneLabel]);

  // Reset the active option when the option set changes (new search, toggle
  // allowNone, or the listbox opens). Clamp on shrink so it never dangles
  // past the end.
  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
  }, [debouncedQuery, isOpen, allowNone]);

  useEffect(() => {
    if (options.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((i) => {
      if (i < 0) return 0;
      if (i >= options.length) return options.length - 1;
      return i;
    });
  }, [options.length]);

  // Keep the active option scrolled into view as the user arrows around.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const opt = options[activeIndex];
    if (!opt) return;
    const el = listboxRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(opt.elementId)}`
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen, options]);

  const commit = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setQuery("");
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
        setIsOpen(true);
      }
      return;
    }

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setActiveIndex((i) => {
        if (options.length === 0) return -1;
        return (i + 1) % options.length;
      });
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActiveIndex((i) => {
        if (options.length === 0) return -1;
        return (i - 1 + options.length) % options.length;
      });
    } else if (ev.key === "Home") {
      if (options.length > 0) {
        ev.preventDefault();
        setActiveIndex(0);
      }
    } else if (ev.key === "End") {
      if (options.length > 0) {
        ev.preventDefault();
        setActiveIndex(options.length - 1);
      }
    } else if (ev.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < options.length) {
        ev.preventDefault();
        commit(options[activeIndex].valueId);
      }
    }
  };

  const displayValue = isOpen
    ? query
    : value === ""
      ? ""
      : resolveQuery.data
        ? resolveQuery.data.name
        : resolveQuery.isPending
          ? "Loading…"
          : "";

  const activeDescendantId =
    isOpen && activeIndex >= 0 && activeIndex < options.length
      ? options[activeIndex].elementId
      : undefined;

  const rootClass = compact ? "combobox combobox-compact" : "combobox";
  const showEmptyState =
    !searchQuery.isPending && !searchQuery.isError && items.length === 0;

  return (
    <div className={rootClass}>
      <input
        ref={inputRef}
        className={compact ? "input input-compact" : "input"}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendantId}
        aria-busy={isOpen && searchQuery.isPending}
        placeholder={isOpen ? "Type a name…" : placeholder}
        value={displayValue}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          setIsOpen(true);
          setQuery("");
        }}
        onBlur={() => {
          setIsOpen(false);
          setQuery("");
        }}
        onChange={(ev) => setQuery(ev.target.value)}
        onKeyDown={onInputKeyDown}
      />
      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          ref={listboxRef}
          className="combobox-listbox"
        >
          {searchQuery.isError ? (
            <li className="combobox-status error" role="alert">
              Failed to load. Keep typing to retry.
            </li>
          ) : searchQuery.isPending && !searchQuery.data ? (
            <li
              className="combobox-status muted"
              role="status"
              aria-live="polite"
            >
              Loading…
            </li>
          ) : null}
          {options.map((opt, i) => {
            const isSelected = value === opt.valueId;
            const isActive = i === activeIndex;
            const classes = ["combobox-option"];
            if (isSelected) classes.push("combobox-option-selected");
            if (isActive) classes.push("combobox-option-active");
            return (
              <li
                key={opt.elementId}
                id={opt.elementId}
                role="option"
                aria-selected={isSelected}
                className={classes.join(" ")}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  commit(opt.valueId);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {opt.isNone ? (
                  <span className="muted">{opt.label}</span>
                ) : (
                  opt.label
                )}
              </li>
            );
          })}
          {showEmptyState && !allowNone ? (
            <li className="combobox-status muted">
              {debouncedQuery === "" ? "No authors yet." : "No matches."}
            </li>
          ) : null}
          {showEmptyState && allowNone && debouncedQuery !== "" ? (
            <li className="combobox-status muted">No matches.</li>
          ) : null}
          {searchQuery.data && total > items.length ? (
            <li className="combobox-status muted">
              Showing top {items.length} of {total}. Refine your search to
              narrow.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
