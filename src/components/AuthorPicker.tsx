import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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

/**
 * Searchable author picker backed by `GET /authors?name=<substring>`.
 *
 * Unlike a bounded `<select>` (which caps visibility to the first page of
 * authors), this combobox issues a fresh, debounced query as the user types,
 * so any author is selectable regardless of dataset size. The current value
 * is resolved to a display name via `getAuthor` so the input shows the
 * current selection even when the author is outside the latest search page.
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

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

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

  const items = searchQuery.data?.items ?? [];
  const total = searchQuery.data?.total ?? 0;

  const commit = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const onInputKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Escape") {
      inputRef.current?.blur();
      return;
    }
    if (ev.key === "Enter" && isOpen && items.length > 0) {
      ev.preventDefault();
      commit(items[0].id);
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

  const className = compact ? "combobox combobox-compact" : "combobox";

  return (
    <div className={className}>
      <input
        ref={inputRef}
        className={compact ? "input input-compact" : "input"}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
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
        <ul id={listboxId} role="listbox" className="combobox-listbox">
          {allowNone ? (
            <li
              role="option"
              aria-selected={value === ""}
              className={
                value === ""
                  ? "combobox-option combobox-option-selected"
                  : "combobox-option"
              }
              onMouseDown={(ev) => {
                ev.preventDefault();
                commit("");
              }}
            >
              <span className="muted">{noneLabel}</span>
            </li>
          ) : null}
          {searchQuery.isPending && !searchQuery.data ? (
            <li
              className="combobox-status muted"
              role="status"
              aria-live="polite"
            >
              Loading…
            </li>
          ) : searchQuery.isError ? (
            <li className="combobox-status error" role="alert">
              Failed to load. Keep typing to retry.
            </li>
          ) : items.length === 0 ? (
            <li className="combobox-status muted">
              {debouncedQuery === "" ? "No authors yet." : "No matches."}
            </li>
          ) : (
            <>
              {items.map((a) => (
                <li
                  key={a.id}
                  role="option"
                  aria-selected={value === a.id}
                  className={
                    value === a.id
                      ? "combobox-option combobox-option-selected"
                      : "combobox-option"
                  }
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    commit(a.id);
                  }}
                >
                  {a.name}
                </li>
              ))}
              {total > items.length ? (
                <li className="combobox-status muted">
                  Showing top {items.length} of {total}. Refine your search to
                  narrow.
                </li>
              ) : null}
            </>
          )}
        </ul>
      ) : null}
    </div>
  );
}
