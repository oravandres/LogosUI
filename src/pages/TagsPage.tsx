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
  TAGS_PAGE_SIZE,
  createTag,
  deleteTag,
  listTags,
} from "@/api/tags";
import type { TagWriteBody } from "@/api/types";
import { useToast } from "@/components/useToast";

type DeleteTagVars = {
  id: string;
  onlyRowOnPage: boolean;
  pageOffset: number;
};

export function TagsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [offset, setOffset] = useState(0);

  // Latest list navigation; used to avoid clamping offset after the user
  // moved away during a delete mutation.
  const listContextRef = useRef({ offset });
  listContextRef.current = { offset };

  const listQuery = useQuery({
    queryKey: ["tags", "list", { offset }],
    queryFn: ({ signal }) =>
      listTags({ limit: TAGS_PAGE_SIZE, offset, signal }),
    placeholderData: keepPreviousData,
  });

  const createMutation = useMutation({
    mutationFn: (body: TagWriteBody) => createTag(body),
    onSuccess: async (_data, vars) => {
      setFormName("");
      setFormError(null);
      // Invalidate both the admin list and any cached per-quote pickers.
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success(`Tag "${vars.name}" created`);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not create tag", err);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: DeleteTagVars) => deleteTag(id),
    onSuccess: async (_data, vars) => {
      const ctx = listContextRef.current;
      const stillOnSameView = ctx.offset === vars.pageOffset;
      if (vars.onlyRowOnPage && vars.pageOffset > 0 && stillOnSameView) {
        const next = Math.max(0, vars.pageOffset - TAGS_PAGE_SIZE);
        flushSync(() => {
          setOffset(next);
        });
      }
      // Tag delete cascades to quote_tags; per-quote tag lists must refresh.
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      await queryClient.invalidateQueries({ queryKey: ["quote-tags"] });
      toast.success("Tag deleted");
    },
    onError: (err) => {
      toast.error("Could not delete tag", err);
    },
  });

  const [formName, setFormName] = useState("");
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

  const onSubmitCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const name = formName.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    if (name.length > 100) {
      setFormError("Name must be 100 characters or fewer.");
      return;
    }
    createMutation.mutate({ name });
  };

  const deleteError = useMemo(() => {
    const e = deleteMutation.error;
    if (!e) return null;
    return e instanceof ApiError ? e.message : String(e);
  }, [deleteMutation.error]);

  const isMutating = deleteMutation.isPending;

  return (
    <section className="page">
      <h2>Tags</h2>
      <p className="muted">
        Backed by <code>/api/v1/tags</code>. Tag names are unique. Deleting a
        tag removes it from every quote that references it.
      </p>

      <div className="panel">
        <h3 className="panel-title">Create tag</h3>
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
              aria-label="Tag name"
            />
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
          <h3 className="panel-title toolbar-title">All tags</h3>
          <div className="toolbar-right">
            {listQuery.isFetching && page ? (
              <span className="muted fetch-hint" aria-live="polite">
                Updating…
              </span>
            ) : null}
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
          <p className="muted">No tags yet.</p>
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
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td className="muted nowrap">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="actions">
                        <div className="btn-group">
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            disabled={isMutating}
                            aria-label={`Delete tag ${t.name}`}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete tag "${t.name}"? This removes it from every quote that references it.`
                                )
                              ) {
                                deleteMutation.mutate({
                                  id: t.id,
                                  onlyRowOnPage: page.items.length === 1,
                                  pageOffset: offset,
                                });
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
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
                    setOffset((o) => Math.max(0, o - TAGS_PAGE_SIZE))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext}
                  onClick={() => setOffset((o) => o + TAGS_PAGE_SIZE)}
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
