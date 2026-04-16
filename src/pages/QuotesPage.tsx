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
} from "react";
import { flushSync } from "react-dom";
import { ApiError } from "@/api/client";
import { getAuthor, listAuthors } from "@/api/authors";
import { listAllCategoriesByType } from "@/api/categories";
import { getImage, listImages } from "@/api/images";
import {
  createQuote,
  deleteQuote,
  listQuotes,
  QUOTES_PAGE_SIZE,
  updateQuote,
} from "@/api/quotes";
import type { QuoteWriteBody } from "@/api/types";

const SEARCH_DEBOUNCE_MS = 400;

/** Bounded fetch for author/image pickers (lazy-loaded on first focus). */
const PICKER_LIMIT = 50;

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
  const [categoryFilterId, setCategoryFilterId] = useState("");
  const [authorFilterId, setAuthorFilterId] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [offset, setOffset] = useState(0);

  const [authorPickerArmed, setAuthorPickerArmed] = useState(false);
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

  const authorsPickerQuery = useQuery({
    queryKey: ["authors", "picker", PICKER_LIMIT],
    queryFn: ({ signal }) =>
      listAuthors({ limit: PICKER_LIMIT, offset: 0, signal }),
    enabled: authorPickerArmed,
    staleTime: 60_000,
  });

  const imagesPickerQuery = useQuery({
    queryKey: ["images", "picker", PICKER_LIMIT],
    queryFn: ({ signal }) =>
      listImages({ limit: PICKER_LIMIT, offset: 0, signal }),
    enabled: imagePickerArmed,
    staleTime: 60_000,
  });

  const quoteCategoryOptions = quoteCategoriesQuery.data ?? [];
  const authorOptions = useMemo(
    () => authorsPickerQuery.data?.items ?? [],
    [authorsPickerQuery.data]
  );
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setFormTitle("");
      setFormText("");
      setFormAuthorId("");
      setFormImageId("");
      setFormCategoryId("");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: UpdateQuoteVars) => updateQuote(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setEditingId(null);
      setEditError(null);
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : String(err));
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
    },
  });

  const [formTitle, setFormTitle] = useState("");
  const [formText, setFormText] = useState("");
  const [formAuthorId, setFormAuthorId] = useState("");
  const [formImageId, setFormImageId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [editAuthorId, setEditAuthorId] = useState("");
  const [editImageId, setEditImageId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Fallback lookups for inline edit when the current author/image isn't in
  // the bounded picker window (so the edit <select> always has the row's
  // actual value as a selectable option).
  const authorMissingId = useMemo(() => {
    if (!editingId || editAuthorId === "") return null;
    if (authorOptions.some((a) => a.id === editAuthorId)) return null;
    return editAuthorId;
  }, [editingId, editAuthorId, authorOptions]);

  const authorFallbackQuery = useQuery({
    queryKey: ["authors", "edit-fallback", authorMissingId],
    queryFn: ({ signal }) => getAuthor(authorMissingId!, signal),
    enabled: authorMissingId !== null,
    staleTime: 60_000,
  });

  const authorSelectOptions = useMemo(() => {
    const items = [...authorOptions];
    const extra = authorFallbackQuery.data;
    if (extra && !items.some((a) => a.id === extra.id)) {
      items.unshift(extra);
    }
    return items;
  }, [authorOptions, authorFallbackQuery.data]);

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
    // Arm the pickers so edit selects have options available.
    setAuthorPickerArmed(true);
    setImagePickerArmed(true);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
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
  const authorPickerLoading =
    authorPickerArmed && authorsPickerQuery.isPending;
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
          <label className="field">
            <span className="field-label">Author</span>
            <span className="field-hint muted">
              Focus to load up to {PICKER_LIMIT} authors (API default order).
            </span>
            <select
              className="input"
              value={formAuthorId}
              onChange={(ev) => setFormAuthorId(ev.target.value)}
              onFocus={() => setAuthorPickerArmed(true)}
              disabled={createMutation.isPending || authorPickerLoading}
            >
              <option value="">Select an author…</option>
              {authorOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {truncateMiddle(a.name, 56)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Image</span>
            <span className="field-hint muted">
              Optional. Focus to load up to {PICKER_LIMIT} images.
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
        (authorPickerArmed && authorsPickerQuery.isError) ||
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
            <label className="field inline">
              <span className="field-label">Author</span>
              <select
                className="input input-compact"
                value={authorFilterId}
                onFocus={() => setAuthorPickerArmed(true)}
                onChange={(ev) => onAuthorFilterChange(ev.target.value)}
                disabled={authorPickerLoading}
              >
                <option value="">All</option>
                {authorOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {truncateMiddle(a.name, 32)}
                  </option>
                ))}
              </select>
            </label>
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
          <p className="muted">Loading…</p>
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
          <p className="muted">No quotes in this view.</p>
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
                    <th>Updated</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((q) =>
                    editingId === q.id ? (
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
                          <select
                            className="edit-select"
                            value={editAuthorId}
                            onChange={(ev) =>
                              setEditAuthorId(ev.target.value)
                            }
                            disabled={
                              updateMutation.isPending ||
                              authorPickerLoading ||
                              (authorMissingId !== null &&
                                authorFallbackQuery.isPending)
                            }
                            aria-label={`Author — ${q.title}`}
                          >
                            <option value="">Select an author…</option>
                            {authorSelectOptions.map((a) => (
                              <option key={a.id} value={a.id}>
                                {truncateMiddle(a.name, 32)}
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
                          {truncateMiddle(q.title, 28)}
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
