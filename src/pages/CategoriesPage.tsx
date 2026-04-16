import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { ApiError } from "@/api/client";
import {
  CATEGORIES_PAGE_SIZE,
  type CategoryTypeFilter,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/api/categories";
import type { CategoryWriteBody } from "@/api/types";

const TYPE_OPTIONS: { value: CategoryTypeFilter; label: string }[] = [
  { value: "", label: "All types" },
  { value: "image", label: "image" },
  { value: "quote", label: "quote" },
  { value: "author", label: "author" },
];

const CREATE_TYPES: Exclude<CategoryTypeFilter, "">[] = [
  "image",
  "quote",
  "author",
];

type DeleteCategoryVars = {
  id: string;
  onlyRowOnPage: boolean;
  pageOffset: number;
  typeFilter: CategoryTypeFilter;
};

type UpdateCategoryVars = {
  id: string;
  body: CategoryWriteBody;
};

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<CategoryTypeFilter>("");
  const [offset, setOffset] = useState(0);

  /** Latest list navigation; used to avoid clamping offset after the user moved away during delete. */
  const listContextRef = useRef({ offset, typeFilter });
  listContextRef.current = { offset, typeFilter };

  const listQuery = useQuery({
    queryKey: ["categories", { type: typeFilter, offset }],
    queryFn: ({ signal }) =>
      listCategories({
        limit: CATEGORIES_PAGE_SIZE,
        offset,
        type: typeFilter,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (body: CategoryWriteBody) => createCategory(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setFormName("");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: UpdateCategoryVars) =>
      updateCategory(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditingId(null);
      setEditError(null);
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : String(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteCategoryVars) => deleteCategory(id),
    onSuccess: async (_data, vars) => {
      const ctx = listContextRef.current;
      const stillOnSameView =
        ctx.offset === vars.pageOffset && ctx.typeFilter === vars.typeFilter;
      if (
        vars.onlyRowOnPage &&
        vars.pageOffset > 0 &&
        stillOnSameView
      ) {
        const next = Math.max(0, vars.pageOffset - CATEGORIES_PAGE_SIZE);
        flushSync(() => {
          setOffset(next);
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const [formName, setFormName] = useState("");
  const [formType, setFormType] =
    useState<CategoryWriteBody["type"]>("quote");
  const [formError, setFormError] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<CategoryWriteBody["type"]>("quote");
  const [editError, setEditError] = useState<string | null>(null);

  const startEditing = (id: string, name: string, type: string) => {
    setEditingId(id);
    setEditName(name);
    setEditType(type as CategoryWriteBody["type"]);
    setEditError(null);
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
    setEditError(null);
    updateMutation.mutate({ id: editingId, body: { name, type: editType } });
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

  const onFilterChange = (next: CategoryTypeFilter) => {
    setTypeFilter(next);
    setOffset(0);
  };

  const onSubmitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const name = formName.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    createMutation.mutate({ name, type: formType });
  };

  const deleteError = useMemo(() => {
    const e = deleteMutation.error;
    if (!e) return null;
    return e instanceof ApiError ? e.message : String(e);
  }, [deleteMutation.error]);

  const isMutating = updateMutation.isPending || deleteMutation.isPending;

  return (
    <section className="page">
      <h2>Categories</h2>
      <p className="muted">
        Backed by <code>/api/v1/categories</code>. Types must be{" "}
        <code>image</code>, <code>quote</code>, or <code>author</code>.
      </p>

      <div className="panel">
        <h3 className="panel-title">Create category</h3>
        <form className="form-grid" onSubmit={onSubmitCreate}>
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="input"
              value={formName}
              onChange={(ev) => setFormName(ev.target.value)}
              maxLength={100}
              autoComplete="off"
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field">
            <span className="field-label">Type</span>
            <select
              className="input"
              value={formType}
              onChange={(ev) =>
                setFormType(ev.target.value as CategoryWriteBody["type"])
              }
              disabled={createMutation.isPending}
            >
              {CREATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
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
        {formError ? <p className="error">{formError}</p> : null}
      </div>

      <div
        className="panel"
        aria-busy={listQuery.isFetching && Boolean(page)}
      >
        <div className="toolbar">
          <h3 className="panel-title toolbar-title">All categories</h3>
          <div className="toolbar-right">
            {listQuery.isFetching && page ? (
              <span className="muted fetch-hint" aria-live="polite">
                Updating…
              </span>
            ) : null}
            <label className="field inline">
              <span className="field-label">Filter by type</span>
              <select
                className="input input-compact"
                value={typeFilter}
                onChange={(ev) =>
                  onFilterChange(ev.target.value as CategoryTypeFilter)
                }
              >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            </label>
          </div>
        </div>

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
          <p className="muted">No categories in this view.</p>
        ) : page && page.items.length > 0 ? (
          <>
            <div
              className={
                listQuery.isPlaceholderData
                  ? "table-wrap table-wrap-placeholder"
                  : "table-wrap"
              }
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((c) =>
                    editingId === c.id ? (
                      <tr key={c.id} className="editing">
                        <td>
                          <input
                            className="edit-input"
                            value={editName}
                            onChange={(ev) => setEditName(ev.target.value)}
                            maxLength={100}
                            autoComplete="off"
                            disabled={updateMutation.isPending}
                            autoFocus
                            aria-label={`Name — ${c.name}`}
                          />
                        </td>
                        <td>
                          <select
                            className="edit-select"
                            value={editType}
                            onChange={(ev) =>
                              setEditType(
                                ev.target.value as CategoryWriteBody["type"]
                              )
                            }
                            disabled={updateMutation.isPending}
                            aria-label={`Type — ${c.name}`}
                          >
                            {CREATE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="muted nowrap">
                          {formatDate(c.created_at)}
                        </td>
                        <td className="actions">
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-success btn-small"
                              disabled={updateMutation.isPending}
                              onClick={submitEdit}
                              aria-label={`Save changes for category ${c.name}`}
                            >
                              {updateMutation.isPending ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={updateMutation.isPending}
                              onClick={cancelEditing}
                              aria-label={`Cancel editing category ${c.name}`}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>
                          <code>{c.type}</code>
                        </td>
                        <td className="muted nowrap">
                          {formatDate(c.created_at)}
                        </td>
                        <td className="actions">
                          <div className="btn-group">
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={isMutating}
                              onClick={() =>
                                startEditing(c.id, c.name, c.type)
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              disabled={isMutating}
                              aria-label={`Delete category ${c.name}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete category "${c.name}" (${c.type})?`
                                  )
                                ) {
                                  deleteMutation.mutate({
                                    id: c.id,
                                    onlyRowOnPage: page.items.length === 1,
                                    pageOffset: offset,
                                    typeFilter,
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
                    setOffset((o) => Math.max(0, o - CATEGORIES_PAGE_SIZE))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext}
                  onClick={() => setOffset((o) => o + CATEGORIES_PAGE_SIZE)}
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
