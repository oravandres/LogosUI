import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import {
  CATEGORIES_PAGE_SIZE,
  type CategoryTypeFilter,
  createCategory,
  deleteCategory,
  listCategories,
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

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<CategoryTypeFilter>("");
  const [offset, setOffset] = useState(0);

  const listQuery = useQuery({
    queryKey: ["categories", { type: typeFilter, offset }],
    queryFn: () =>
      listCategories({
        limit: CATEGORIES_PAGE_SIZE,
        offset,
        type: typeFilter,
      }),
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const [formName, setFormName] = useState("");
  const [formType, setFormType] =
    useState<CategoryWriteBody["type"]>("quote");
  const [formError, setFormError] = useState<string | null>(null);

  const page = listQuery.data;
  const rangeStart = page ? page.offset + 1 : 0;
  const rangeEnd = page
    ? Math.min(page.offset + page.items.length, page.total)
    : 0;

  const canPrev = offset > 0;
  const canNext = page ? offset + page.items.length < page.total : false;

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

      <div className="panel">
        <div className="toolbar">
          <h3 className="panel-title toolbar-title">All categories</h3>
          <label className="field inline">
            <span className="field-label">Filter by type</span>
            <select
              className="input input-compact"
              value={typeFilter}
              onChange={(ev) =>
                onFilterChange(ev.target.value as CategoryTypeFilter)
              }
              disabled={listQuery.isFetching}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {listQuery.isPending ? (
          <p className="muted">Loading…</p>
        ) : listQuery.isError ? (
          <p className="error">
            {listQuery.error instanceof ApiError
              ? listQuery.error.message
              : String(listQuery.error)}
          </p>
        ) : page && page.items.length === 0 ? (
          <p className="muted">No categories in this view.</p>
        ) : page ? (
          <>
            <div className="table-wrap">
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
                  {page.items.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>
                        <code>{c.type}</code>
                      </td>
                      <td className="muted nowrap">
                        {formatDate(c.created_at)}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-danger btn-small"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete category “${c.name}” (${c.type})?`
                              )
                            ) {
                              deleteMutation.mutate(c.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
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
                  disabled={!canPrev || listQuery.isFetching}
                  onClick={() =>
                    setOffset((o) => Math.max(0, o - CATEGORIES_PAGE_SIZE))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext || listQuery.isFetching}
                  onClick={() => setOffset((o) => o + CATEGORIES_PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
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
