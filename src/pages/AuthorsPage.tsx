import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { ApiError } from "@/api/client";
import {
  AUTHORS_PAGE_SIZE,
  createAuthor,
  deleteAuthor,
  listAuthors,
} from "@/api/authors";
import { listAllCategoriesByType } from "@/api/categories";
import { listAllImages } from "@/api/images";
import type { AuthorWriteBody } from "@/api/types";

const SEARCH_DEBOUNCE_MS = 400;

type DeleteAuthorVars = {
  id: string;
  onlyRowOnPage: boolean;
  pageOffset: number;
  categoryFilterId: string;
  nameSearch: string;
};

export function AuthorsPage() {
  const queryClient = useQueryClient();
  const [categoryFilterId, setCategoryFilterId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setAppliedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setOffset(0);
  }, [appliedSearch, categoryFilterId]);

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
    queryKey: ["images", "picker", "all"],
    queryFn: ({ signal }) => listAllImages(signal),
    staleTime: 60_000,
  });

  const authorCategoryOptions = authorCategoriesQuery.data ?? [];
  const imageOptions = imagesPickerQuery.data ?? [];

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["authors"] });
      setFormName("");
      setFormBio("");
      setFormBorn("");
      setFormDied("");
      setFormImageId("");
      setFormCategoryId("");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
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
        flushSync(() => {
          setOffset(next);
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["authors"] });
    },
  });

  const [formName, setFormName] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formBorn, setFormBorn] = useState("");
  const [formDied, setFormDied] = useState("");
  const [formImageId, setFormImageId] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const page = listQuery.data;
  const rangeStart = page ? page.offset + 1 : 0;
  const rangeEnd = page
    ? Math.min(page.offset + page.items.length, page.total)
    : 0;

  const canPrev = offset > 0;
  const canNext = page
    ? page.offset + page.items.length < page.total
    : false;

  const onFilterChange = (next: string) => {
    setCategoryFilterId(next);
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

  const pickersLoading =
    authorCategoriesQuery.isPending || imagesPickerQuery.isPending;

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
            <select
              className="input"
              value={formImageId}
              onChange={(ev) => setFormImageId(ev.target.value)}
              disabled={createMutation.isPending || pickersLoading}
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
              disabled={createMutation.isPending || pickersLoading}
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
        {authorCategoriesQuery.isError || imagesPickerQuery.isError ? (
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
                onChange={(ev) => onFilterChange(ev.target.value)}
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
          <p className="muted">No authors in this view.</p>
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
                  {page.items.map((a) => (
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
                        <button
                          type="button"
                          className="btn btn-danger btn-small"
                          disabled={deleteMutation.isPending}
                          aria-label={`Delete author ${a.name}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete author “${a.name}”? This fails if they have quotes.`
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
                  disabled={!canPrev}
                  onClick={() =>
                    setOffset((o) => Math.max(0, o - AUTHORS_PAGE_SIZE))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext}
                  onClick={() => setOffset((o) => o + AUTHORS_PAGE_SIZE)}
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

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - (max - 1 - half))}`;
}
