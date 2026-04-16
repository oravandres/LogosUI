import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getAuthor, listAuthors } from "@/api/authors";
import { Combobox, type ComboboxOption } from "@/components/Combobox";

const DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 20;
const NONE_VALUE = "__none__";

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
 * Searchable, keyboard-operable author picker backed by
 * `GET /authors?name=<substring>`.
 *
 * Unlike a bounded `<select>` (which caps visibility to the first page of
 * authors), this combobox issues a fresh, debounced query as the user types,
 * so any author is selectable regardless of dataset size. The current value
 * is resolved to a display name via `getAuthor` so the input shows the
 * current selection even when the author is outside the latest search page.
 *
 * Built on top of the shared `<Combobox>` primitive, which owns the WAI-ARIA
 * combobox keyboard contract (Arrow / Home / End / Enter / Escape,
 * `aria-activedescendant`, scroll-into-view, mouse-down commit).
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

  const items = useMemo(
    () => searchQuery.data?.items ?? [],
    [searchQuery.data]
  );
  const total = searchQuery.data?.total ?? 0;

  const options: ComboboxOption[] = useMemo(() => {
    const opts: ComboboxOption[] = [];
    if (allowNone) {
      opts.push({
        value: NONE_VALUE,
        label: noneLabel,
        render: () => <span className="muted">{noneLabel}</span>,
      });
    }
    for (const a of items) {
      opts.push({ value: a.id, label: a.name });
    }
    return opts;
  }, [allowNone, items, noneLabel]);

  const displayValue =
    value === ""
      ? ""
      : resolveQuery.data
        ? resolveQuery.data.name
        : resolveQuery.isPending
          ? "Loading…"
          : "";

  const showEmptyState =
    !searchQuery.isPending && !searchQuery.isError && items.length === 0;

  // The "All authors" row is itself an option, so we only need an extra empty-state
  // message when the search came back empty and there is no none-row to fall back to.
  const emptyState =
    showEmptyState && !allowNone ? (
      <li className="combobox-status muted">
        {debouncedQuery === "" ? "No authors yet." : "No matches."}
      </li>
    ) : showEmptyState && allowNone && debouncedQuery !== "" ? (
      <li className="combobox-status muted">No matches.</li>
    ) : null;

  const listboxHeader = searchQuery.isError ? (
    <li className="combobox-status error" role="alert">
      Failed to load. Keep typing to retry.
    </li>
  ) : searchQuery.isPending && !searchQuery.data ? (
    <li className="combobox-status muted" role="status" aria-live="polite">
      Loading…
    </li>
  ) : null;

  const listboxFooter =
    searchQuery.data && total > items.length ? (
      <li className="combobox-status muted">
        Showing top {items.length} of {total}. Refine your search to narrow.
      </li>
    ) : null;

  return (
    <Combobox
      options={options}
      value={value === "" ? NONE_VALUE : value}
      onSelect={(selected) =>
        onChange(selected === NONE_VALUE ? "" : selected)
      }
      query={query}
      onQueryChange={setQuery}
      displayValue={displayValue}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      openPlaceholder="Type a name…"
      disabled={disabled}
      isBusy={searchQuery.isPending}
      compact={compact}
      listboxHeader={listboxHeader}
      listboxFooter={listboxFooter}
      emptyState={emptyState}
    />
  );
}
