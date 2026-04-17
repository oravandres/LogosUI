import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router";
import { ApiError } from "@/api/client";
import { listAllCategoriesByType } from "@/api/categories";
import { getImage, listImages } from "@/api/images";
import {
  createQuote,
  deleteQuote,
  listQuotes,
  QUOTES_PAGE_SIZE,
  updateQuote,
} from "@/api/quotes";
import {
  addTagToQuote,
  listAllTags,
  listQuoteTags,
  removeTagFromQuote,
} from "@/api/tags";
import type { QuoteWriteBody } from "@/api/types";
import { AuthorPicker } from "@/components/AuthorPicker";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/components/useToast";

const SEARCH_DEBOUNCE_MS = 400;

/** Bounded fetch for the (optional) image picker. */
const IMAGE_PICKER_LIMIT = 50;

type DeleteQuoteVars = {
  id: string;
  onlyRowOnPage: boolean;
  pageOffset: number;
  categoryFilterId: string;
  authorFilterId: string;
  titleSearch: string;
};

type UpdateQuoteVars = {
  id: string;
  body: QuoteWriteBody;
};

export function QuotesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [categoryFilterId, setCategoryFilterId] = useState("");
  const [authorFilterId, setAuthorFilterId] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [offset, setOffset] = useState(0);

  const [imagePickerArmed, setImagePickerArmed] = useState(false);

  const lastAppliedTitleRef = useRef("");
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = titleInput.trim();
      if (lastAppliedTitleRef.current === next) {
        return;
      }
      lastAppliedTitleRef.current = next;
      setOffset(0);
      setAppliedTitle(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [titleInput]);

  const listContextRef = useRef({
    offset,
    categoryFilterId,
    authorFilterId,
    titleSearch: appliedTitle,
  });
  listContextRef.current = {
    offset,
    categoryFilterId,
    authorFilterId,
    titleSearch: appliedTitle,
  };

  const quoteCategoriesQuery = useQuery({
    queryKey: ["categories", "picker", "quote"],
    queryFn: ({ signal }) => listAllCategoriesByType("quote", signal),
    staleTime: 60_000,
  });

  const imagesPickerQuery = useQuery({
    queryKey: ["images", "picker", IMAGE_PICKER_LIMIT],
    queryFn: ({ signal }) =>
      listImages({ limit: IMAGE_PICKER_LIMIT, offset: 0, signal }),
    enabled: imagePickerArmed,
    staleTime: 60_000,
  });

  const quoteCategoryOptions = quoteCategoriesQuery.data ?? [];
  const imageOptions = useMemo(
    () => imagesPickerQuery.data?.items ?? [],
    [imagesPickerQuery.data]
  );

  const listQuery = useQuery({
    queryKey: [
      "quotes",
      {
        categoryFilterId,
        authorFilterId,
        titleSearch: appliedTitle,
        offset,
      },
    ],
    queryFn: ({ signal }) =>
      listQuotes({
        limit: QUOTES_PAGE_SIZE,
        offset,
        categoryId: categoryFilterId,
        authorId: authorFilterId,
        title: appliedTitle,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (body: QuoteWriteBody) => createQuote(body),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setFormTitle("");
      setFormText("");
      setFormAuthorId("");
      setFormImageId("");
      setFormCategoryId("");
      setFormError(null);
      toast.success(`Quote "${vars.title}" created`);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not create quote", err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: UpdateQuoteVars) => updateQuote(id, body),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setEditingId(null);
      setEditError(null);
      toast.success(`Quote "${vars.body.title}" updated`);
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not update quote", err);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteQuoteVars) => deleteQuote(id),
    onSuccess: async (_data, vars) => {
      const ctx = listContextRef.current;
      const stillOnSameView =
        ctx.offset === vars.pageOffset &&
        ctx.categoryFilterId === vars.categoryFilterId &&
        ctx.authorFilterId === vars.authorFilterId &&
        ctx.titleSearch === vars.titleSearch;
      if (vars.onlyRowOnPage && vars.pageOffset > 0 && stillOnSameView) {
        const next = Math.max(0, vars.pageOffset - QUOTES_PAGE_SIZE);
        flushSync(() => {
          setOffset(next);
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Quote deleted");
    },
    onError: (err) => {
      toast.error("Could not delete quote", err);
    },
  });

  const [formTitle, setFormTitle] = useState("");
  const [formText, setFormText] = useState("");
  const [formAuthorId, setFormAuthorId] = useState("");
  const [formImageId, setFormImageId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const formTitleInputRef = useRef<HTMLInputElement | null>(null);

  const focusCreateForm = () => {
    formTitleInputRef.current?.focus();
  };

  const clearFilters = () => {
    setCategoryFilterId("");
    setAuthorFilterId("");
    setTitleInput("");
    setAppliedTitle("");
    lastAppliedTitleRef.current = "";
    setOffset(0);
  };

  const hasActiveFilter =
    categoryFilterId !== "" ||
    authorFilterId !== "" ||
    appliedTitle !== "";

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingTagsForId, setManagingTagsForId] = useState<string | null>(
    null
  );
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [editAuthorId, setEditAuthorId] = useState("");
  const [editImageId, setEditImageId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Fallback lookup for inline edit so the image <select> always has the
  // row's current image as a selectable option, even when it falls outside
  // the bounded image-picker window.
  const imageMissingId = useMemo(() => {
    if (!editingId || editImageId === "") return null;
    if (imageOptions.some((img) => img.id === editImageId)) return null;
    return editImageId;
  }, [editingId, editImageId, imageOptions]);

  const imageFallbackQuery = useQuery({
    queryKey: ["images", "edit-fallback", imageMissingId],
    queryFn: ({ signal }) => getImage(imageMissingId!, signal),
    enabled: imageMissingId !== null,
    staleTime: 60_000,
  });

  const imageSelectOptions = useMemo(() => {
    const items = [...imageOptions];
    const extra = imageFallbackQuery.data;
    if (extra && !items.some((i) => i.id === extra.id)) {
      items.unshift(extra);
    }
    return items;
  }, [imageOptions, imageFallbackQuery.data]);

  const startEditing = (q: {
    id: string;
    title: string;
    text: string;
    author_id: string;
    image_id: string | null;
    category_id: string | null;
  }) => {
    setEditingId(q.id);
    setEditTitle(q.title);
    setEditText(q.text);
    setEditAuthorId(q.author_id);
    setEditImageId(q.image_id ?? "");
    setEditCategoryId(q.category_id ?? "");
    setEditError(null);
    // Opening the inline edit closes any tag-management panel on the same or
    // another row — only one row-level mode is active at a time.
    setManagingTagsForId(null);
    // Arm the image picker so edit select has options available. The
    // author picker pulls its own data as the user interacts.
    setImagePickerArmed(true);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const startManagingTags = (id: string) => {
    setEditingId(null);
    setEditError(null);
    setManagingTagsForId(id);
  };

  const stopManagingTags = () => {
    setManagingTagsForId(null);
  };

  const submitEdit = () => {
    if (!editingId) return;
    const title = editTitle.trim();
    const text = editText.trim();
    if (!title) {
      setEditError("Title is required.");
      return;
    }
    if (!text) {
      setEditError("Text is required.");
      return;
    }
    if (editAuthorId === "") {
      setEditError("Author is required.");
      return;
    }
    const body: QuoteWriteBody = {
      title,
      text,
      author_id: editAuthorId,
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
    setCategoryFilterId(next);
    setOffset(0);
  };

  const onAuthorFilterChange = (next: string) => {
    setAuthorFilterId(next);
    setOffset(0);
  };

  const onSubmitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const title = formTitle.trim();
    const text = formText.trim();
    if (!title) {
      setFormError("Title is required.");
      return;
    }
    if (!text) {
      setFormError("Text is required.");
      return;
    }
    if (formAuthorId === "") {
      setFormError("Author is required.");
      return;
    }
    const body: QuoteWriteBody = {
      title,
      text,
      author_id: formAuthorId,
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

  const categoryPickerLoading = quoteCategoriesQuery.isPending;
  const imagePickerLoading =
    imagePickerArmed && imagesPickerQuery.isPending;

  const isMutating = updateMutation.isPending || deleteMutation.isPending;

  return (
    <section className="page">
      <h2>Quotes</h2>
      <p className="muted">
        Backed by <code>/api/v1/quotes</code>. <code>author_id</code> is
        required. Optional category must be a <code>quote</code>-type
        category.
      </p>

      <div className="panel">
        <h3 className="panel-title">Create quote</h3>
        <form
          className="form-grid form-grid-quotes"
          onSubmit={onSubmitCreate}
        >
          <label className="field field-span-2">
            <span className="field-label">Title</span>
            <input
              ref={formTitleInputRef}
              className="input"
              value={formTitle}
              onChange={(ev) => setFormTitle(ev.target.value)}
              maxLength={500}
              autoComplete="off"
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field field-span-2">
            <span className="field-label">Text</span>
            <textarea
              className="input textarea"
              value={formText}
              onChange={(ev) => setFormText(ev.target.value)}
              rows={4}
              disabled={createMutation.isPending}
            />
          </label>
          <div className="field">
            <span className="field-label">Author</span>
            <span className="field-hint muted">
              Type to search authors by name — every author is reachable.
            </span>
            <AuthorPicker
              value={formAuthorId}
              onChange={setFormAuthorId}
              disabled={createMutation.isPending}
              ariaLabel="Author"
            />
          </div>
          <label className="field">
            <span className="field-label">Image</span>
            <span className="field-hint muted">
              Optional. Focus to load up to {IMAGE_PICKER_LIMIT} images.
            </span>
            <select
              className="input"
              value={formImageId}
              onChange={(ev) => setFormImageId(ev.target.value)}
              onFocus={() => setImagePickerArmed(true)}
              disabled={createMutation.isPending || imagePickerLoading}
            >
              <option value="">None</option>
              {imageOptions.map((img) => (
                <option key={img.id} value={img.id}>
                  {truncateMiddle(img.url, 56)}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-span-2">
            <span className="field-label">Category</span>
            <select
              className="input"
              value={formCategoryId}
              onChange={(ev) => setFormCategoryId(ev.target.value)}
              disabled={createMutation.isPending || categoryPickerLoading}
            >
              <option value="">None</option>
              {quoteCategoryOptions.map((c) => (
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
        {quoteCategoriesQuery.isError ||
        (imagePickerArmed && imagesPickerQuery.isError) ? (
          <p className="error" role="alert">
            Some pickers failed to load. You can retry or refresh to populate
            them.
          </p>
        ) : null}
        {formError ? <p className="error">{formError}</p> : null}
      </div>

      <div
        className="panel"
        aria-busy={listQuery.isFetching && Boolean(page)}
      >
        <div className="toolbar toolbar-authors">
          <h3 className="panel-title toolbar-title">All quotes</h3>
          <div className="toolbar-right toolbar-right-wrap">
            {listQuery.isFetching && page ? (
              <span className="muted fetch-hint" aria-live="polite">
                Updating…
              </span>
            ) : null}
            <label className="field inline field-grow">
              <span className="field-label">Search title</span>
              <input
                className="input input-compact input-search"
                type="search"
                value={titleInput}
                onChange={(ev) => setTitleInput(ev.target.value)}
                placeholder="Substring…"
                autoComplete="off"
                aria-describedby="quotes-search-hint"
              />
            </label>
            <div className="field inline">
              <span className="field-label">Author</span>
              <AuthorPicker
                compact
                allowNone
                noneLabel="All authors"
                value={authorFilterId}
                onChange={onAuthorFilterChange}
                placeholder="All authors"
                ariaLabel="Filter by author"
              />
            </div>
            <label className="field inline">
              <span className="field-label">Category</span>
              <select
                className="input input-compact"
                value={categoryFilterId}
                onChange={(ev) => onCategoryFilterChange(ev.target.value)}
              >
                <option value="">All</option>
                {quoteCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p id="quotes-search-hint" className="muted hint-text">
          Title filter updates after you stop typing for a moment.
        </p>

        {listQuery.isPending && !page ? (
          <ListSkeleton rows={5} ariaLabel="Loading quotes" />
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
              title="No quotes match your filters"
              description="Try a different search, author, or category, or clear the filters to see everything."
            >
              <button type="button" className="btn" onClick={clearFilters}>
                Clear filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState
              title="No quotes yet"
              description="Capture your first quote to start building the corpus."
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={focusCreateForm}
              >
                Create a quote
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
              <table className="data-table data-table-quotes">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Text</th>
                    <th>Author</th>
                    <th>Img.</th>
                    <th>Cat.</th>
                    <th>Tags</th>
                    <th>Updated</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.flatMap((q) => {
                    const isEditing = editingId === q.id;
                    const isManagingTags = managingTagsForId === q.id;
                    const rows: ReactNode[] = [];
                    rows.push(
                      isEditing ? (
                      <tr key={q.id} className="editing">
                        <td>
                          <input
                            className="edit-input"
                            value={editTitle}
                            onChange={(ev) => setEditTitle(ev.target.value)}
                            maxLength={500}
                            autoComplete="off"
                            disabled={updateMutation.isPending}
                            autoFocus
                            aria-label={`Title — ${q.title}`}
                          />
                        </td>
                        <td>
                          <textarea
                            className="edit-input edit-textarea"
                            value={editText}
                            onChange={(ev) => setEditText(ev.target.value)}
                            rows={3}
                            disabled={updateMutation.isPending}
                            aria-label={`Text — ${q.title}`}
                          />
                        </td>
                        <td>
                          <AuthorPicker
                            compact
                            value={editAuthorId}
                            onChange={setEditAuthorId}
                            disabled={updateMutation.isPending}
                            ariaLabel={`Author — ${q.title}`}
                          />
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
                              imagePickerLoading ||
                              (imageMissingId !== null &&
                                imageFallbackQuery.isPending)
                            }
                            aria-label={`Image — ${q.title}`}
                          >
                            <option value="">None</option>
                            {imageSelectOptions.map((img) => (
                              <option key={img.id} value={img.id}>
                                {truncateMiddle(img.url, 32)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="edit-select"
                            value={editCategoryId}
                            onChange={(ev) =>
                              setEditCategoryId(ev.target.value)
                            }
                            disabled={
                              updateMutation.isPending ||
                              categoryPickerLoading
                            }
                            aria-label={`Category — ${q.title}`}
                          >
                            <option value="">None</option>
                            {quoteCategoryOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted">
                          <QuoteTagChips quoteId={q.id} />
                        </td>
                        <td className="muted nowrap">
                          {formatDate(q.updated_at)}
                        </td>
                        <td className="actions">
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-success btn-small"
                              disabled={updateMutation.isPending}
                              onClick={submitEdit}
                              aria-label={`Save changes for quote ${q.title}`}
                            >
                              {updateMutation.isPending ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={updateMutation.isPending}
                              onClick={cancelEditing}
                              aria-label={`Cancel editing quote ${q.title}`}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={q.id}>
                        <td className="nowrap-strong" title={q.title}>
                          {/*
                            The visible label is truncated for table layout,
                            but the link's accessible name must be the full
                            title — `<td title=...>` is a tooltip hint and is
                            not exposed as the link's name to screen readers
                            or voice-control users.
                          */}
                          <Link
                            to={`/quotes/${q.id}`}
                            className="row-title-link"
                            aria-label={q.title}
                          >
                            {truncateMiddle(q.title, 28)}
                          </Link>
                        </td>
                        <td className="muted quote-text-cell" title={q.text}>
                          {truncateMiddle(q.text, 40)}
                        </td>
                        <td className="muted nowrap">
                          <code className="id-chip">{q.author_id}</code>
                        </td>
                        <td className="muted nowrap">
                          {q.image_id ? (
                            <code className="id-chip">{q.image_id}</code>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="muted nowrap">
                          {q.category_id ? (
                            <code className="id-chip">{q.category_id}</code>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="muted">
                          <QuoteTagChips quoteId={q.id} />
                        </td>
                        <td className="muted nowrap">
                          {formatDate(q.updated_at)}
                        </td>
                        <td className="actions">
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={isMutating}
                              onClick={() => startEditing(q)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={isMutating}
                              aria-expanded={isManagingTags}
                              aria-label={`Manage tags for ${q.title}`}
                              onClick={() =>
                                isManagingTags
                                  ? stopManagingTags()
                                  : startManagingTags(q.id)
                              }
                            >
                              {isManagingTags ? "Close tags" : "Tags"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              disabled={isMutating}
                              aria-label={`Delete quote ${q.title}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete quote "${truncateMiddle(q.title, 60)}"?`
                                  )
                                ) {
                                  deleteMutation.mutate({
                                    id: q.id,
                                    onlyRowOnPage: page.items.length === 1,
                                    pageOffset: offset,
                                    categoryFilterId,
                                    authorFilterId,
                                    titleSearch: appliedTitle,
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
                    );
                    if (!isEditing && isManagingTags) {
                      rows.push(
                        <QuoteTagsEditorRow
                          key={`${q.id}-tags`}
                          quoteId={q.id}
                          quoteTitle={q.title}
                          colSpan={8}
                          onClose={stopManagingTags}
                        />
                      );
                    }
                    return rows;
                  })}
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
                  onClick={() =>
                    setOffset((o) => Math.max(0, o - QUOTES_PAGE_SIZE))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext}
                  onClick={() => setOffset((o) => o + QUOTES_PAGE_SIZE)}
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

/** Reads and renders the list of tags on a single quote as compact chips. */
function QuoteTagChips({ quoteId }: { quoteId: string }) {
  const query = useQuery({
    queryKey: ["quote-tags", quoteId],
    queryFn: ({ signal }) => listQuoteTags(quoteId, signal),
    staleTime: 30_000,
  });

  if (query.isPending) {
    return <span className="muted">…</span>;
  }
  if (query.isError) {
    const err = query.error;
    if (err instanceof ApiError && err.status === 404) {
      return (
        <span className="muted" title="Quote no longer exists on the server">
          gone
        </span>
      );
    }
    return <span className="muted">—</span>;
  }
  const tags = query.data ?? [];
  if (tags.length === 0) {
    return <span className="muted">—</span>;
  }
  return (
    <ul className="tag-chip-list tag-chip-list-readonly">
      {tags.map((t) => (
        <li key={t.id} className="tag-chip tag-chip-static">
          {t.name}
        </li>
      ))}
    </ul>
  );
}

type QuoteTagsEditorRowProps = {
  quoteId: string;
  quoteTitle: string;
  colSpan: number;
  onClose: () => void;
};

/**
 * Inline editor row for managing tag associations on a single quote.
 *
 * Error mapping mirrors the backend's parent-vs-child distinction:
 * - `GET/POST .../tags` → `404` means the parent quote itself is gone
 *   (show a stable "please refresh" message; do not retry blindly).
 * - `POST .../tags` → `422` means the supplied `tag_id` is invalid
 *   (usually a tag deleted elsewhere); refresh the tag cache and tell
 *   the user their selection is stale.
 */
function QuoteTagsEditorRow({
  quoteId,
  quoteTitle,
  colSpan,
  onClose,
}: QuoteTagsEditorRowProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [addId, setAddId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  /**
   * Sticky flag: once *any* request against this parent quote returns 404
   * (the initial GET, or a subsequent POST), the panel becomes read-only and
   * stays that way until the user closes it. This is important for the POST
   * path because `tagsQuery` may still hold a stale success result from
   * before the quote was deleted, which would otherwise keep the add UI
   * rendered while the cache invalidation is in flight.
   */
  const [parentMissingLocal, setParentMissingLocal] = useState(false);

  const tagsQuery = useQuery({
    queryKey: ["quote-tags", quoteId],
    queryFn: ({ signal }) => listQuoteTags(quoteId, signal),
  });

  const allTagsQuery = useQuery({
    queryKey: ["tags", "all"],
    queryFn: ({ signal }) => listAllTags(signal),
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: (tagId: string) => addTagToQuote(quoteId, tagId),
    onSuccess: async (_data, tagId) => {
      setLocalError(null);
      setAddId("");
      await queryClient.invalidateQueries({
        queryKey: ["quote-tags", quoteId],
      });
      const tagName =
        allTagsQuery.data?.items.find((t) => t.id === tagId)?.name;
      toast.success(
        tagName
          ? `Tag "${tagName}" added to "${quoteTitle}"`
          : `Tag added to "${quoteTitle}"`
      );
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          // Parent gone after the panel was already open. Latch the local
          // flag so the editor controls hide immediately (the parent-missing
          // banner alone is not enough — the add UI is gated on this), and
          // invalidate the per-row cache so the chip cell on the quote row
          // also flips to "gone" without waiting for a manual refresh.
          setParentMissingLocal(true);
          setLocalError(null);
          setAddId("");
          queryClient.invalidateQueries({
            queryKey: ["quote-tags", quoteId],
          });
          return;
        }
        if (err.status === 422) {
          setLocalError(
            "The selected tag no longer exists. Refreshing the tag list…"
          );
          queryClient.invalidateQueries({ queryKey: ["tags"] });
          // The submitted id is now known-bad; clear it so the user cannot
          // resubmit the same dead tag while the cache repopulates. The Add
          // button is also gated on the current value still being selectable.
          setAddId("");
          return;
        }
        setLocalError(err.message);
        return;
      }
      setLocalError(String(err));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tagId: string) => removeTagFromQuote(quoteId, tagId),
    onSuccess: async (_data, tagId) => {
      setLocalError(null);
      await queryClient.invalidateQueries({
        queryKey: ["quote-tags", quoteId],
      });
      const tagName = current.find((t) => t.id === tagId)?.name;
      toast.success(
        tagName
          ? `Tag "${tagName}" removed from "${quoteTitle}"`
          : `Tag removed from "${quoteTitle}"`
      );
    },
    onError: (err) => {
      setLocalError(err instanceof ApiError ? err.message : String(err));
    },
  });

  const parentMissing =
    parentMissingLocal ||
    (tagsQuery.isError &&
      tagsQuery.error instanceof ApiError &&
      tagsQuery.error.status === 404);

  const current = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);
  const currentIds = useMemo(
    () => new Set(current.map((t) => t.id)),
    [current]
  );
  const allTags = allTagsQuery.data?.items ?? [];
  const selectable = allTags.filter((t) => !currentIds.has(t.id));
  const busy = addMutation.isPending || removeMutation.isPending;
  // Defense in depth: the Add button must not fire when `addId` references a
  // tag that has dropped out of the refreshed list (e.g. after a 422), even
  // if `setAddId("")` was missed for any reason.
  const isAddIdSelectable =
    addId !== "" && selectable.some((t) => t.id === addId);

  return (
    <tr className="tag-editor-row">
      <td colSpan={colSpan}>
        <div className="tag-editor">
          <div className="tag-editor-header">
            <strong>Tags for “{truncateMiddle(quoteTitle, 48)}”</strong>
            <button
              type="button"
              className="btn btn-small"
              onClick={onClose}
              aria-label={`Done managing tags for ${quoteTitle}`}
            >
              Done
            </button>
          </div>

          {parentMissing ? (
            <p className="error" role="alert">
              This quote no longer exists on the server. Close this panel and
              refresh the list.
            </p>
          ) : tagsQuery.isError ? (
            <p className="error" role="alert">
              {tagsQuery.error instanceof ApiError
                ? tagsQuery.error.message
                : String(tagsQuery.error)}
            </p>
          ) : null}

          {/*
            Empty-state, the chip list, and the add UI all gate on
            `isSuccess && !parentMissing`. Two traps the gate has to cover:
            1. A non-404 read failure must not masquerade as an empty quote
               (would render "No tags yet." + add picker over an error).
            2. A 404 from `addTagToQuote` after the panel is already open
               must immediately hide the editor controls; relying on
               `tagsQuery.isError` alone leaves a window where the stale
               success result keeps the add UI rendered against a dead
               parent. `parentMissingLocal` closes that window.
          */}
          {tagsQuery.isPending ? (
            <p className="muted">Loading tags…</p>
          ) : tagsQuery.isSuccess && !parentMissing && current.length === 0 ? (
            <p className="muted">No tags yet.</p>
          ) : tagsQuery.isSuccess && !parentMissing ? (
            <ul className="tag-chip-list">
              {current.map((t) => (
                <li key={t.id} className="tag-chip">
                  <span>{t.name}</span>
                  <button
                    type="button"
                    className="tag-chip-remove"
                    disabled={busy}
                    onClick={() => removeMutation.mutate(t.id)}
                    aria-label={`Remove tag ${t.name} from ${quoteTitle}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {tagsQuery.isSuccess && !parentMissing ? (
            <div className="tag-editor-add">
              <label className="field inline">
                <span className="field-label">Add tag</span>
                <select
                  className="input input-compact"
                  value={addId}
                  onChange={(ev) => setAddId(ev.target.value)}
                  disabled={busy || allTagsQuery.isPending}
                  aria-label={`Add tag to ${quoteTitle}`}
                >
                  <option value="">
                    {allTagsQuery.isPending
                      ? "Loading tags…"
                      : selectable.length === 0
                        ? "No more tags to add"
                        : "Select a tag…"}
                  </option>
                  {selectable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-small"
                disabled={
                  busy || allTagsQuery.isPending || !isAddIdSelectable
                }
                onClick={() => {
                  if (isAddIdSelectable) {
                    addMutation.mutate(addId);
                  }
                }}
              >
                {addMutation.isPending ? "Adding…" : "Add"}
              </button>
              {allTagsQuery.data?.truncated ? (
                <span className="muted fetch-hint">
                  Showing first {allTagsQuery.data.items.length} of{" "}
                  {allTagsQuery.data.total} tags.
                </span>
              ) : null}
              {allTagsQuery.isError ? (
                <span className="error fetch-hint" role="alert">
                  Tag list failed to load.
                </span>
              ) : null}
            </div>
          ) : null}

          {localError ? <p className="error">{localError}</p> : null}
        </div>
      </td>
    </tr>
  );
}
