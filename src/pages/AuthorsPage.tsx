import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router";
import { ApiError } from "@/api/client";
import {
  AUTHORS_PAGE_SIZE,
  createAuthor,
  deleteAuthor,
  listAuthors,
  updateAuthor,
} from "@/api/authors";
import { listAllCategoriesByType } from "@/api/categories";
import { getImage, listImages } from "@/api/images";
import type { AuthorWriteBody } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/useToast";
import { parseOffsetParam } from "@/url/offsetParam";

const SEARCH_DEBOUNCE_MS = 400;

/** Bounded fetch for portrait picker (lazy-loaded on first focus). */
const PORTRAIT_PICKER_LIMIT = 50;

type DeleteAuthorVars = {
  id: string;
  onlyRowOnPage: boolean;
  pageOffset: number;
  categoryFilterId: string;
  nameSearch: string;
};

type UpdateAuthorVars = {
  id: string;
  body: AuthorWriteBody;
};

export function AuthorsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL search params are the actual source of truth — derived directly,
  // not mirrored from local state — so browser back/forward, programmatic
  // `navigate('?…')`, and shareable links all flow into the list without
  // any hydration effect to keep in sync. Mirrors the contract documented
  // in `.cursor/rules/12-pr-review-lessons.mdc` (URL search params as
  // state) and applied to QuotesPage in PR #20.
  const categoryFilterId = searchParams.get("category_id") ?? "";
  const appliedSearch = searchParams.get("name") ?? "";
  const offset = parseOffsetParam(searchParams.get("offset"));

  // Editable draft for the search box — stays in local state so each
  // keystroke does not roundtrip through the URL. The debounced effect
  // below commits it into `?name` once the user stops typing.
  const [searchInput, setSearchInput] = useState(() => appliedSearch);

  const [portraitPickerArmed, setPortraitPickerArmed] = useState(false);

  /**
   * Latches the URL string we last wrote ourselves so the resync effect
   * below can distinguish "we just committed this" from "the URL changed
   * underneath us" (back/forward, sidebar link, deep link, programmatic
   * `navigate('?…')`). Initialized to `null` so the very first render
   * after mount is treated as external — that's harmless because
   * `searchInput`'s initializer already seeded it from `appliedSearch`.
   */
  const lastSelfWrittenSearchRef = useRef<string | null>(null);

  /**
   * Centralized setter that mutates the current URL search params with
   * `replace: true` so the back stack does not collect a history entry
   * per filter change or per keystroke. Empty values are deleted (rather
   * than set to `""`) so the URL stays clean.
   *
   * Pass a mutator callback rather than a fully constructed
   * `URLSearchParams` so concurrent updates never race over a stale
   * snapshot of the URL. Records the resulting string into
   * `lastSelfWrittenSearchRef` so the resync effect can recognize self
   * writes and skip clobbering the editable draft on its own commits.
   */
  const updateSearchParams = useCallback(
    (mutator: (next: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutator(next);
          lastSelfWrittenSearchRef.current = next.toString();
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  /**
   * Tracks the `?name` value we last committed via the debounce / handler
   * paths so the debounce effect can bail when the in-flight draft already
   * matches the current URL.
   */
  const lastAppliedSearchRef = useRef(appliedSearch);

  /**
   * Resync the editable search-box draft on **any** external URL change
   * — not just `?name` changes — so the debounce/navigation race
   * documented in `.cursor/rules/12-pr-review-lessons.mdc` (and fixed for
   * QuotesPage in commit `7e62017`) cannot leak a stale draft across
   * cross-navigation. Self writes (debounced commit, filter handlers,
   * pager, delete `onSuccess`) pre-record their resulting URL into
   * `lastSelfWrittenSearchRef`, so this effect skips them and does not
   * clobber the user's typing on every round-trip.
   */
  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (lastSelfWrittenSearchRef.current === currentSearch) {
      return;
    }
    lastSelfWrittenSearchRef.current = currentSearch;
    lastAppliedSearchRef.current = appliedSearch;
    setSearchInput(appliedSearch);
  }, [searchParams, appliedSearch]);

  // Debounced commit of the editable draft into `?name`. Resetting
  // `?offset` in the same URL transition (rather than a separate effect)
  // avoids the extra `listAuthors` call with the stale offset.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchInput.trim();
      if (lastAppliedSearchRef.current === next) {
        return;
      }
      lastAppliedSearchRef.current = next;
      updateSearchParams((p) => {
        if (next) {
          p.set("name", next);
        } else {
          p.delete("name");
        }
        p.delete("offset");
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput, updateSearchParams]);

  const listContextRef = useRef({
    offset,
    categoryFilterId,
    nameSearch: appliedSearch,
  });
  listContextRef.current = {
    offset,
    categoryFilterId,
    nameSearch: appliedSearch,
  };

  const authorCategoriesQuery = useQuery({
    queryKey: ["categories", "picker", "author"],
    queryFn: ({ signal }) => listAllCategoriesByType("author", signal),
    staleTime: 60_000,
  });

  const imagesPickerQuery = useQuery({
    queryKey: ["images", "picker", "portrait", PORTRAIT_PICKER_LIMIT],
    queryFn: ({ signal }) =>
      listImages({
        limit: PORTRAIT_PICKER_LIMIT,
        offset: 0,
        signal,
      }),
    enabled: portraitPickerArmed,
    staleTime: 60_000,
  });

  const authorCategoryOptions = authorCategoriesQuery.data ?? [];
  const imageOptions = useMemo(
    () => imagesPickerQuery.data?.items ?? [],
    [imagesPickerQuery.data]
  );

  const listQuery = useQuery({
    queryKey: [
      "authors",
      { categoryFilterId, nameSearch: appliedSearch, offset },
    ],
    queryFn: ({ signal }) =>
      listAuthors({
        limit: AUTHORS_PAGE_SIZE,
        offset,
        categoryId: categoryFilterId,
        name: appliedSearch,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (body: AuthorWriteBody) => createAuthor(body),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["authors"] });
      setFormName("");
      setFormBio("");
      setFormBorn("");
      setFormDied("");
      setFormImageId("");
      setFormCategoryId("");
      setFormError(null);
      toast.success(`Author "${vars.name}" created`);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not create author", err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: UpdateAuthorVars) => updateAuthor(id, body),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["authors"] });
      setEditingId(null);
      setEditError(null);
      toast.success(`Author "${vars.body.name}" updated`);
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not update author", err);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteAuthorVars) => deleteAuthor(id),
    onSuccess: async (_data, vars) => {
      const ctx = listContextRef.current;
      const stillOnSameView =
        ctx.offset === vars.pageOffset &&
        ctx.categoryFilterId === vars.categoryFilterId &&
        ctx.nameSearch === vars.nameSearch;
      if (vars.onlyRowOnPage && vars.pageOffset > 0 && stillOnSameView) {
        const next = Math.max(0, vars.pageOffset - AUTHORS_PAGE_SIZE);
        // `flushSync` ensures the URL transition (and the dependent list
        // query key) is committed before `invalidateQueries` triggers the
        // refetch — otherwise the refetch goes out with the stale offset.
        flushSync(() => {
          updateSearchParams((p) => {
            if (next > 0) p.set("offset", String(next));
            else p.delete("offset");
          });
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["authors"] });
      toast.success("Author deleted");
    },
    onError: (err) => {
      toast.error("Could not delete author", err);
    },
  });

  const [formName, setFormName] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formBorn, setFormBorn] = useState("");
  const [formDied, setFormDied] = useState("");
  const [formImageId, setFormImageId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const formNameInputRef = useRef<HTMLInputElement | null>(null);

  const focusCreateForm = () => {
    formNameInputRef.current?.focus();
  };

  const clearFilters = () => {
    // Clearing the editable draft and the latched "last committed" marker
    // alongside the URL transition prevents the debounce effect from
    // firing a redundant follow-up commit with the now-empty value.
    setSearchInput("");
    lastAppliedSearchRef.current = "";
    updateSearchParams((p) => {
      p.delete("category_id");
      p.delete("name");
      p.delete("offset");
    });
  };

  const hasActiveFilter = categoryFilterId !== "" || appliedSearch !== "";

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editBorn, setEditBorn] = useState("");
  const [editDied, setEditDied] = useState("");
  const [editImageId, setEditImageId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const portraitMissingId = useMemo(() => {
    if (!editingId || editImageId === "") return null;
    if (imageOptions.some((img) => img.id === editImageId)) return null;
    return editImageId;
  }, [editingId, editImageId, imageOptions]);

  const portraitFallbackQuery = useQuery({
    queryKey: ["images", "edit-portrait-fallback", portraitMissingId],
    queryFn: ({ signal }) => getImage(portraitMissingId!, signal),
    enabled: portraitMissingId !== null,
    staleTime: 60_000,
  });

  const portraitSelectOptions = useMemo(() => {
    const items = [...imageOptions];
    const extra = portraitFallbackQuery.data;
    if (extra && !items.some((i) => i.id === extra.id)) {
      items.unshift(extra);
    }
    return items;
  }, [imageOptions, portraitFallbackQuery.data]);

  const startEditing = (a: {
    id: string;
    name: string;
    bio: string | null;
    born_date: string | null;
    died_date: string | null;
    image_id: string | null;
    category_id: string | null;
  }) => {
    setEditingId(a.id);
    setEditName(a.name);
    setEditBio(a.bio ?? "");
    setEditBorn(a.born_date ?? "");
    setEditDied(a.died_date ?? "");
    setEditImageId(a.image_id ?? "");
    setEditCategoryId(a.category_id ?? "");
    setEditError(null);
    // Arm the portrait picker so options are available for the edit row
    setPortraitPickerArmed(true);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const submitEdit = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      setEditError("Name is required.");
      return;
    }
    if (editBorn && editDied && editDied < editBorn) {
      setEditError("Died date must not be earlier than born date.");
      return;
    }
    const bioTrim = editBio.trim();
    const body: AuthorWriteBody = {
      name,
      bio: bioTrim === "" ? null : bioTrim,
      born_date: editBorn === "" ? null : editBorn,
      died_date: editDied === "" ? null : editDied,
      image_id: editImageId === "" ? null : editImageId,
      category_id: editCategoryId === "" ? null : editCategoryId,
    };
    setEditError(null);
    updateMutation.mutate({ id: editingId, body });
  };

  const page = listQuery.data;
  const rangeStart = page ? page.offset + 1 : 0;
  const rangeEnd = page
    ? Math.min(page.offset + page.items.length, page.total)
    : 0;

  const canPrev = offset > 0;
  const canNext = page
    ? page.offset + page.items.length < page.total
    : false;

  const onCategoryFilterChange = (next: string) => {
    updateSearchParams((p) => {
      if (next) p.set("category_id", next);
      else p.delete("category_id");
      p.delete("offset");
    });
  };

  const onSubmitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const name = formName.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    if (formBorn && formDied && formDied < formBorn) {
      setFormError("Died date must not be earlier than born date.");
      return;
    }
    const bioTrim = formBio.trim();
    const body: AuthorWriteBody = {
      name,
      bio: bioTrim === "" ? null : bioTrim,
      born_date: formBorn === "" ? null : formBorn,
      died_date: formDied === "" ? null : formDied,
      image_id: formImageId === "" ? null : formImageId,
      category_id: formCategoryId === "" ? null : formCategoryId,
    };
    createMutation.mutate(body);
  };

  const deleteError = useMemo(() => {
    const err = deleteMutation.error;
    if (!err) return null;
    return err instanceof ApiError ? err.message : String(err);
  }, [deleteMutation.error]);

  const authorPickerLoading = authorCategoriesQuery.isPending;
  const portraitPickerLoading =
    portraitPickerArmed && imagesPickerQuery.isPending;

  const isMutating = updateMutation.isPending || deleteMutation.isPending;

  return (
    <section className="page">
      <h2>Authors</h2>
      <p className="muted">
        Backed by <code>/api/v1/authors</code>. Optional category must be an{" "}
        <code>author</code>-type category. Dates use <code>YYYY-MM-DD</code>.
      </p>

      <div className="panel">
        <h3 className="panel-title">Create author</h3>
        <form className="form-grid form-grid-authors" onSubmit={onSubmitCreate}>
          <label className="field field-span-2">
            <span className="field-label">Name</span>
            <input
              ref={formNameInputRef}
              className="input"
              value={formName}
              onChange={(ev) => setFormName(ev.target.value)}
              maxLength={255}
              autoComplete="off"
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field field-span-2">
            <span className="field-label">Bio</span>
            <textarea
              className="input textarea"
              value={formBio}
              onChange={(ev) => setFormBio(ev.target.value)}
              rows={3}
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field">
            <span className="field-label">Born</span>
            <input
              className="input"
              type="date"
              value={formBorn}
              onChange={(ev) => setFormBorn(ev.target.value)}
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field">
            <span className="field-label">Died</span>
            <input
              className="input"
              type="date"
              value={formDied}
              onChange={(ev) => setFormDied(ev.target.value)}
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field">
            <span className="field-label">Portrait image</span>
            <span className="field-hint muted">
              Focus to load up to {PORTRAIT_PICKER_LIMIT} images (API default
              order).
            </span>
            <select
              className="input"
              value={formImageId}
              onChange={(ev) => setFormImageId(ev.target.value)}
              onFocus={() => setPortraitPickerArmed(true)}
              disabled={createMutation.isPending || portraitPickerLoading}
            >
              <option value="">None</option>
              {imageOptions.map((img) => (
                <option key={img.id} value={img.id}>
                  {truncateMiddle(img.url, 56)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Category</span>
            <select
              className="input"
              value={formCategoryId}
              onChange={(ev) => setFormCategoryId(ev.target.value)}
              disabled={createMutation.isPending || authorPickerLoading}
            >
              <option value="">None</option>
              {authorCategoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
        {authorCategoriesQuery.isError ||
        (portraitPickerArmed && imagesPickerQuery.isError) ? (
          <p className="error" role="alert">
            Some pickers failed to load. You can still create authors without
            optional references.
          </p>
        ) : null}
        {formError ? <p className="error">{formError}</p> : null}
      </div>

      <div
        className="panel"
        aria-busy={listQuery.isFetching && Boolean(page)}
      >
        <div className="toolbar toolbar-authors">
          <h3 className="panel-title toolbar-title">All authors</h3>
          <div className="toolbar-right toolbar-right-wrap">
            {listQuery.isFetching && page ? (
              <span className="muted fetch-hint" aria-live="polite">
                Updating…
              </span>
            ) : null}
            <label className="field inline field-grow">
              <span className="field-label">Search name</span>
              <input
                className="input input-compact input-search"
                type="search"
                value={searchInput}
                onChange={(ev) => setSearchInput(ev.target.value)}
                placeholder="Substring…"
                autoComplete="off"
                aria-describedby="authors-search-hint"
              />
            </label>
            <label className="field inline">
              <span className="field-label">Category</span>
              <select
                className="input input-compact"
                value={categoryFilterId}
                onChange={(ev) => onCategoryFilterChange(ev.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All</option>
                {authorCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p id="authors-search-hint" className="muted hint-text">
          Search updates after you stop typing for a moment.
        </p>

        {listQuery.isPending && !page ? (
          <ListSkeleton rows={5} ariaLabel="Loading authors" />
        ) : listQuery.isError && !page ? (
          <p className="error">
            {listQuery.error instanceof ApiError
              ? listQuery.error.message
              : String(listQuery.error)}
          </p>
        ) : listQuery.isError && page ? (
          <p className="error" role="alert">
            Could not refresh the list. Showing previous results.
          </p>
        ) : null}

        {page && page.items.length === 0 && !listQuery.isPending ? (
          hasActiveFilter ? (
            <EmptyState
              title="No authors match your filters"
              description="Try a different search or category, or clear the filters to see everyone."
            >
              <button type="button" className="btn" onClick={clearFilters}>
                Clear filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState
              title="No authors yet"
              description="Add your first author so quotes can be attributed."
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={focusCreateForm}
              >
                Create an author
              </button>
            </EmptyState>
          )
        ) : page && page.items.length > 0 ? (
          <>
            <div
              className={
                listQuery.isPlaceholderData
                  ? "table-wrap table-wrap-placeholder"
                  : "table-wrap"
              }
            >
              <table className="data-table data-table-authors">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Bio</th>
                    <th>Born</th>
                    <th>Died</th>
                    <th>Cat.</th>
                    <th>Img.</th>
                    <th>Updated</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((a) =>
                    editingId === a.id ? (
                      <tr key={a.id} className="editing">
                        <td>
                          <input
                            className="edit-input"
                            value={editName}
                            onChange={(ev) => setEditName(ev.target.value)}
                            maxLength={255}
                            autoComplete="off"
                            disabled={updateMutation.isPending}
                            autoFocus
                            aria-label={`Name — ${a.name}`}
                          />
                        </td>
                        <td>
                          <textarea
                            className="edit-input edit-textarea"
                            value={editBio}
                            onChange={(ev) => setEditBio(ev.target.value)}
                            rows={2}
                            disabled={updateMutation.isPending}
                            aria-label={`Bio — ${a.name}`}
                          />
                        </td>
                        <td>
                          <input
                            className="edit-input"
                            type="date"
                            value={editBorn}
                            onChange={(ev) => setEditBorn(ev.target.value)}
                            disabled={updateMutation.isPending}
                            aria-label={`Born — ${a.name}`}
                          />
                        </td>
                        <td>
                          <input
                            className="edit-input"
                            type="date"
                            value={editDied}
                            onChange={(ev) => setEditDied(ev.target.value)}
                            disabled={updateMutation.isPending}
                            aria-label={`Died — ${a.name}`}
                          />
                        </td>
                        <td>
                          <select
                            className="edit-select"
                            value={editCategoryId}
                            onChange={(ev) =>
                              setEditCategoryId(ev.target.value)
                            }
                            disabled={
                              updateMutation.isPending || authorPickerLoading
                            }
                            aria-label={`Category — ${a.name}`}
                          >
                            <option value="">None</option>
                            {authorCategoryOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="edit-select"
                            value={editImageId}
                            onChange={(ev) =>
                              setEditImageId(ev.target.value)
                            }
                            disabled={
                              updateMutation.isPending ||
                              portraitPickerLoading ||
                              (portraitMissingId !== null &&
                                portraitFallbackQuery.isPending)
                            }
                            aria-label={`Portrait image — ${a.name}`}
                          >
                            <option value="">None</option>
                            {portraitSelectOptions.map((img) => (
                              <option key={img.id} value={img.id}>
                                {truncateMiddle(img.url, 40)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted nowrap">
                          {formatDate(a.updated_at)}
                        </td>
                        <td className="actions">
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-success btn-small"
                              disabled={updateMutation.isPending}
                              onClick={submitEdit}
                              aria-label={`Save changes for author ${a.name}`}
                            >
                              {updateMutation.isPending ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={updateMutation.isPending}
                              onClick={cancelEditing}
                              aria-label={`Cancel editing author ${a.name}`}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={a.id}>
                        <td className="nowrap-strong">{a.name}</td>
                        <td className="muted bio-cell" title={a.bio ?? undefined}>
                          {a.bio ? truncateMiddle(a.bio, 36) : "—"}
                        </td>
                        <td className="muted nowrap">{a.born_date ?? "—"}</td>
                        <td className="muted nowrap">{a.died_date ?? "—"}</td>
                        <td className="muted nowrap">
                          {a.category_id ? (
                            <code className="id-chip">{a.category_id}</code>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="muted nowrap">
                          {a.image_id ? (
                            <code className="id-chip">{a.image_id}</code>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="muted nowrap">
                          {formatDate(a.updated_at)}
                        </td>
                        <td className="actions">
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={isMutating}
                              onClick={() => startEditing(a)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              disabled={isMutating}
                              aria-label={`Delete author ${a.name}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete author "${a.name}"? This fails if they have quotes.`
                                  )
                                ) {
                                  deleteMutation.mutate({
                                    id: a.id,
                                    onlyRowOnPage: page.items.length === 1,
                                    pageOffset: offset,
                                    categoryFilterId,
                                    nameSearch: appliedSearch,
                                  });
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted">
                {page.total === 0
                  ? "0 results"
                  : `${rangeStart}–${rangeEnd} of ${page.total}`}
              </span>
              <div className="pager-buttons">
                <button
                  type="button"
                  className="btn"
                  disabled={!canPrev}
                  onClick={() => {
                    const next = Math.max(0, offset - AUTHORS_PAGE_SIZE);
                    updateSearchParams((p) => {
                      if (next > 0) p.set("offset", String(next));
                      else p.delete("offset");
                    });
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext}
                  onClick={() => {
                    const next = offset + AUTHORS_PAGE_SIZE;
                    updateSearchParams((p) =>
                      p.set("offset", String(next))
                    );
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
        {editError ? <p className="error">{editError}</p> : null}
        {deleteError ? <p className="error">{deleteError}</p> : null}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - (max - 1 - half))}`;
}
