import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { ApiError } from "@/api/client";
import { listAllCategoriesByType } from "@/api/categories";
import {
  createImage,
  deleteImage,
  IMAGES_PAGE_SIZE,
  listImages,
} from "@/api/images";
import type { ImageWriteBody } from "@/api/types";
import { safeHttpHref } from "@/url/safeHttpUrl";

type DeleteImageVars = {
  id: string;
  onlyRowOnPage: boolean;
  pageOffset: number;
  categoryFilterId: string;
};

export function ImagesPage() {
  const queryClient = useQueryClient();
  const [categoryFilterId, setCategoryFilterId] = useState("");
  const [offset, setOffset] = useState(0);

  const listContextRef = useRef({ offset, categoryFilterId });
  listContextRef.current = { offset, categoryFilterId };

  const imageCategoriesQuery = useQuery({
    queryKey: ["categories", "picker", "image"],
    queryFn: ({ signal }) => listAllCategoriesByType("image", signal),
    staleTime: 60_000,
  });

  const imageCategoryOptions = imageCategoriesQuery.data ?? [];

  const listQuery = useQuery({
    queryKey: ["images", { categoryFilterId, offset }],
    queryFn: ({ signal }) =>
      listImages({
        limit: IMAGES_PAGE_SIZE,
        offset,
        categoryId: categoryFilterId,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (body: ImageWriteBody) => createImage(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["images"] });
      setFormUrl("");
      setFormAlt("");
      setFormCategoryId("");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteImageVars) => deleteImage(id),
    onSuccess: async (_data, vars) => {
      const ctx = listContextRef.current;
      const stillOnSameView =
        ctx.offset === vars.pageOffset &&
        ctx.categoryFilterId === vars.categoryFilterId;
      if (vars.onlyRowOnPage && vars.pageOffset > 0 && stillOnSameView) {
        const next = Math.max(0, vars.pageOffset - IMAGES_PAGE_SIZE);
        flushSync(() => {
          setOffset(next);
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });

  const [formUrl, setFormUrl] = useState("");
  const [formAlt, setFormAlt] = useState("");
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
    setOffset(0);
  };

  const onSubmitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const url = formUrl.trim();
    if (!url) {
      setFormError("URL is required.");
      return;
    }
    const altTrim = formAlt.trim();
    const body: ImageWriteBody = {
      url,
      alt_text: altTrim === "" ? null : altTrim,
      category_id: formCategoryId === "" ? null : formCategoryId,
    };
    createMutation.mutate(body);
  };

  const deleteError = useMemo(() => {
    const err = deleteMutation.error;
    if (!err) return null;
    return err instanceof ApiError ? err.message : String(err);
  }, [deleteMutation.error]);

  return (
    <section className="page">
      <h2>Images</h2>
      <p className="muted">
        Backed by <code>/api/v1/images</code>. Optional category must be an{" "}
        <code>image</code>-type category.
      </p>

      <div className="panel">
        <h3 className="panel-title">Register image</h3>
        <form className="form-grid form-grid-images" onSubmit={onSubmitCreate}>
          <label className="field field-span-2">
            <span className="field-label">URL</span>
            <input
              className="input"
              type="text"
              value={formUrl}
              onChange={(ev) => setFormUrl(ev.target.value)}
              placeholder="https://…"
              maxLength={2048}
              autoComplete="off"
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field">
            <span className="field-label">Alt text</span>
            <input
              className="input"
              value={formAlt}
              onChange={(ev) => setFormAlt(ev.target.value)}
              maxLength={500}
              autoComplete="off"
              disabled={createMutation.isPending}
            />
          </label>
          <label className="field">
            <span className="field-label">Category (optional)</span>
            <select
              className="input"
              value={formCategoryId}
              onChange={(ev) => setFormCategoryId(ev.target.value)}
              disabled={
                createMutation.isPending || imageCategoriesQuery.isPending
              }
            >
              <option value="">None</option>
              {imageCategoryOptions.map((c) => (
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
        {imageCategoriesQuery.isError ? (
          <p className="error" role="alert">
            Could not load image categories for the dropdown. You can still
            create images without a category.
          </p>
        ) : null}
        {formError ? <p className="error">{formError}</p> : null}
      </div>

      <div
        className="panel"
        aria-busy={listQuery.isFetching && Boolean(page)}
      >
        <div className="toolbar">
          <h3 className="panel-title toolbar-title">All images</h3>
          <div className="toolbar-right">
            {listQuery.isFetching && page ? (
              <span className="muted fetch-hint" aria-live="polite">
                Updating…
              </span>
            ) : null}
            <label className="field inline">
              <span className="field-label">Filter by category</span>
              <select
                className="input input-compact"
                value={categoryFilterId}
                onChange={(ev) => onFilterChange(ev.target.value)}
              >
                <option value="">All</option>
                {imageCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
          <p className="muted">No images in this view.</p>
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
                    <th>URL</th>
                    <th>Alt</th>
                    <th>Category</th>
                    <th>Updated</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((img) => {
                    const linkHref = safeHttpHref(img.url);
                    const displayUrl = truncateUrl(img.url, 48);
                    return (
                    <tr key={img.id}>
                      <td>
                        {linkHref ? (
                          <a
                            className="table-link"
                            href={linkHref}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {displayUrl}
                          </a>
                        ) : (
                          <span className="muted" title={img.url}>
                            {displayUrl}
                          </span>
                        )}
                      </td>
                      <td className="muted">
                        {img.alt_text ?? "—"}
                      </td>
                      <td className="muted nowrap">
                        {img.category_id ? (
                          <code className="id-chip">{img.category_id}</code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="muted nowrap">
                        {formatDate(img.updated_at)}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-danger btn-small"
                          disabled={deleteMutation.isPending}
                          aria-label={`Delete image ${truncateUrl(img.url, 40)}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete this image?\n${img.url}`
                              )
                            ) {
                              deleteMutation.mutate({
                                id: img.id,
                                onlyRowOnPage: page.items.length === 1,
                                pageOffset: offset,
                                categoryFilterId,
                              });
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    );
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
                    setOffset((o) => Math.max(0, o - IMAGES_PAGE_SIZE))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext}
                  onClick={() => setOffset((o) => o + IMAGES_PAGE_SIZE)}
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

function truncateUrl(url: string, max: number): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}
