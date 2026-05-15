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
  type ChangeEvent,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { ApiError } from "@/api/client";
import { listAllCategoriesByType } from "@/api/categories";
import {
  createImage,
  deleteImage,
  IMAGES_PAGE_SIZE,
  listImages,
  updateImage,
  uploadImage,
} from "@/api/images";
import type { ImageWriteBody } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/useToast";
import { safeHttpHref } from "@/url/safeHttpUrl";

type DeleteImageVars = {
  id: string;
  onlyRowOnPage: boolean;
  pageOffset: number;
  categoryFilterId: string;
};

type UpdateImageVars = {
  id: string;
  body: ImageWriteBody;
};

/**
 * Browser-side allowlist of image MIME types we accept for upload.
 * Mirrors `supportedUploadFormats` in
 * `Logos/internal/handler/images.go`. Keeping the lists in sync at the
 * boundary lets us surface a clear "this file type isn't supported"
 * error before paying the full network round-trip.
 */
const ACCEPTED_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/**
 * Default 10 MiB cap, matching the Logos server-side default
 * (`LOGOS_IMAGE_MAX_UPLOAD_BYTES`). Hard-coding here is a pragmatic
 * shortcut for v1 — the server still enforces its own cap, so a
 * client-server drift just means the user sees a 413 instead of an
 * earlier client-side validation error.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type RegisterTab = "url" | "upload";

export function ImagesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
      toast.success("Image registered");
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not register image", err);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({
      file,
      altText,
      categoryId,
    }: {
      file: File;
      altText: string | null;
      categoryId: string | null;
    }) => uploadImage(file, { alt_text: altText, category_id: categoryId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["images"] });
      resetUploadForm();
      toast.success("Image uploaded");
    },
    onError: (err) => {
      setUploadError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not upload image", err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: UpdateImageVars) => updateImage(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["images"] });
      setEditingId(null);
      setEditError(null);
      toast.success("Image updated");
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : String(err));
      toast.error("Could not update image", err);
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
      toast.success("Image deleted");
    },
    onError: (err) => {
      toast.error("Could not delete image", err);
    },
  });

  const [activeTab, setActiveTab] = useState<RegisterTab>("url");

  // URL tab state.
  const [formUrl, setFormUrl] = useState("");
  const [formAlt, setFormAlt] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const formUrlInputRef = useRef<HTMLInputElement | null>(null);

  // Upload tab state.
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Build a preview URL for the selected file. Object URLs MUST be
  // revoked once they're no longer in use to avoid leaking the in-memory
  // blob handle. The `useEffect` here owns the lifecycle.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!uploadFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadFile]);

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadAlt("");
    setUploadCategoryId("");
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const focusCreateForm = () => {
    setActiveTab("url");
    formUrlInputRef.current?.focus();
  };

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const startEditing = (
    id: string,
    url: string,
    altText: string | null,
    catId: string | null
  ) => {
    setEditingId(id);
    setEditUrl(url);
    setEditAlt(altText ?? "");
    setEditCategoryId(catId ?? "");
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError(null);
  };

  const submitEdit = () => {
    if (!editingId) return;
    const url = editUrl.trim();
    if (!url) {
      setEditError("URL is required.");
      return;
    }
    const altTrim = editAlt.trim();
    const body: ImageWriteBody = {
      url,
      alt_text: altTrim === "" ? null : altTrim,
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

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setUploadError(null);
    if (!file) {
      setUploadFile(null);
      return;
    }
    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
      setUploadError(
        `Unsupported file type. Allowed: ${ACCEPTED_UPLOAD_TYPES.join(", ")}.`
      );
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `File is ${formatBytes(file.size)}, which exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} cap.`
      );
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploadFile(file);
  };

  const onSubmitUpload = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploadError(null);
    if (!uploadFile) {
      setUploadError("Select an image file before uploading.");
      return;
    }
    const altTrim = uploadAlt.trim();
    uploadMutation.mutate({
      file: uploadFile,
      altText: altTrim === "" ? null : altTrim,
      categoryId: uploadCategoryId === "" ? null : uploadCategoryId,
    });
  };

  const deleteError = useMemo(() => {
    const err = deleteMutation.error;
    if (!err) return null;
    return err instanceof ApiError ? err.message : String(err);
  }, [deleteMutation.error]);

  const isMutating = updateMutation.isPending || deleteMutation.isPending;

  return (
    <section className="page">
      <h2>Images</h2>
      <p className="muted">
        Backed by <code>/api/v1/images</code>. Optional category must be an{" "}
        <code>image</code>-type category.
      </p>

      <div className="panel">
        <h3 className="panel-title">Register image</h3>
        <Tabs
          ariaLabel="Register image source"
          value={activeTab}
          onChange={(id) => setActiveTab(id as RegisterTab)}
          items={[
            {
              id: "url",
              label: "By URL",
              panel: (
                <form
                  className="form-grid form-grid-images"
                  onSubmit={onSubmitCreate}
                >
                  <label className="field field-span-2">
                    <span className="field-label">URL</span>
                    <input
                      ref={formUrlInputRef}
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
                        createMutation.isPending ||
                        imageCategoriesQuery.isPending
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
              ),
            },
            {
              id: "upload",
              label: "Upload from disk",
              panel: (
                <form
                  className="form-grid form-grid-images"
                  onSubmit={onSubmitUpload}
                >
                  <label className="field field-span-2">
                    <span className="field-label">Image file</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_UPLOAD_TYPES.join(",")}
                      onChange={onPickFile}
                      disabled={uploadMutation.isPending}
                    />
                    <span className="field-hint muted">
                      PNG, JPEG, GIF, or WebP, up to{" "}
                      {formatBytes(MAX_UPLOAD_BYTES)}.
                    </span>
                  </label>
                  {previewUrl ? (
                    <div className="field field-span-2 upload-preview">
                      <img
                        src={previewUrl}
                        alt={
                          uploadAlt.trim() === ""
                            ? "Selected image preview"
                            : `Preview: ${uploadAlt.trim()}`
                        }
                        className="upload-preview-image"
                      />
                      {uploadFile ? (
                        <span className="muted upload-preview-meta">
                          {uploadFile.name} · {formatBytes(uploadFile.size)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="field">
                    <span className="field-label">Alt text</span>
                    <input
                      className="input"
                      value={uploadAlt}
                      onChange={(ev) => setUploadAlt(ev.target.value)}
                      maxLength={500}
                      autoComplete="off"
                      disabled={uploadMutation.isPending}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Category (optional)</span>
                    <select
                      className="input"
                      value={uploadCategoryId}
                      onChange={(ev) => setUploadCategoryId(ev.target.value)}
                      disabled={
                        uploadMutation.isPending ||
                        imageCategoriesQuery.isPending
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
                      disabled={uploadMutation.isPending || !uploadFile}
                    >
                      {uploadMutation.isPending ? "Uploading…" : "Upload"}
                    </button>
                  </div>
                </form>
              ),
            },
          ]}
        />
        {imageCategoriesQuery.isError ? (
          <p className="error" role="alert">
            Could not load image categories for the dropdown. You can still
            create images without a category.
          </p>
        ) : null}
        {activeTab === "url" && formError ? (
          <p className="error">{formError}</p>
        ) : null}
        {activeTab === "upload" && uploadError ? (
          <p className="error">{uploadError}</p>
        ) : null}
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
          <ListSkeleton rows={5} ariaLabel="Loading images" />
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
          categoryFilterId !== "" ? (
            <EmptyState
              title="No images match this filter"
              description="Try a different category, or clear the filter to see everything."
            >
              <button
                type="button"
                className="btn"
                onClick={() => onFilterChange("")}
              >
                Clear filter
              </button>
            </EmptyState>
          ) : (
            <EmptyState
              title="No images yet"
              description="Register your first image to start attaching visuals to quotes."
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={focusCreateForm}
              >
                Register an image
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
                    const rowAriaName = `${truncateUrl(img.url, 40)} (${img.id})`;
                    if (editingId === img.id) {
                      return (
                        <tr key={img.id} className="editing">
                          <td>
                            <input
                              className="edit-input"
                              value={editUrl}
                              onChange={(ev) => setEditUrl(ev.target.value)}
                              maxLength={2048}
                              autoComplete="off"
                              disabled={updateMutation.isPending}
                              autoFocus
                              aria-label={`URL — ${rowAriaName}`}
                            />
                          </td>
                          <td>
                            <input
                              className="edit-input"
                              value={editAlt}
                              onChange={(ev) => setEditAlt(ev.target.value)}
                              maxLength={500}
                              autoComplete="off"
                              disabled={updateMutation.isPending}
                              aria-label={`Alt text — ${rowAriaName}`}
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
                                updateMutation.isPending ||
                                imageCategoriesQuery.isPending
                              }
                              aria-label={`Category — ${rowAriaName}`}
                            >
                              <option value="">None</option>
                              {imageCategoryOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="muted nowrap">
                            {formatDate(img.updated_at)}
                          </td>
                          <td className="actions">
                            <div className="btn-group">
                              <button
                                type="button"
                                className="btn btn-success btn-small"
                                disabled={updateMutation.isPending}
                                onClick={submitEdit}
                                aria-label={`Save changes for image ${rowAriaName}`}
                              >
                                {updateMutation.isPending ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-small"
                                disabled={updateMutation.isPending}
                                onClick={cancelEditing}
                                aria-label={`Cancel editing image ${rowAriaName}`}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

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
                        <div className="btn-group">
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={isMutating}
                            onClick={() =>
                              startEditing(
                                img.id,
                                img.url,
                                img.alt_text,
                                img.category_id
                              )
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            disabled={isMutating}
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
                        </div>
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

function truncateUrl(url: string, max: number): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  return `${mib.toFixed(1)} MiB`;
}
