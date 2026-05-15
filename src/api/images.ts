import { fetchJson, postJson, postMultipart, putJson } from "@/api/client";
import type {
  Image,
  ImageUploadMetadata,
  ImageWriteBody,
  PaginatedResponse,
} from "@/api/types";

const API_PREFIX = "/api/v1/images";

/** Matches Logos `model.DefaultLimit`. */
export const IMAGES_PAGE_SIZE = 20;

export type ListImagesParams = {
  limit?: number;
  offset?: number;
  /** When empty, no `category_id` query param is sent. */
  categoryId?: string;
  signal?: AbortSignal;
};

export function listImages(
  params: ListImagesParams = {}
): Promise<PaginatedResponse<Image>> {
  const limit = params.limit ?? IMAGES_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  search.set("offset", String(offset));
  if (params.categoryId && params.categoryId.trim() !== "") {
    search.set("category_id", params.categoryId.trim());
  }
  const q = search.toString();
  return fetchJson<PaginatedResponse<Image>>(`${API_PREFIX}?${q}`, {
    signal: params.signal,
  });
}

export function getImage(
  id: string,
  signal?: AbortSignal
): Promise<Image> {
  return fetchJson<Image>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    signal,
  });
}

export function createImage(body: ImageWriteBody): Promise<Image> {
  return postJson<Image>(API_PREFIX, body);
}

export function updateImage(
  id: string,
  body: ImageWriteBody
): Promise<Image> {
  return putJson<Image>(`${API_PREFIX}/${encodeURIComponent(id)}`, body);
}

export function deleteImage(id: string): Promise<void> {
  return fetchJson<void>(`${API_PREFIX}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * Upload a binary file from disk to Logos via the multipart endpoint.
 *
 * Wire shape: `POST /api/v1/images/uploads`, `multipart/form-data` with
 * a `file` part (the image bytes) plus optional `alt_text` and
 * `category_id` form fields. On success the server returns the new
 * persisted `Image` row (`source: "uploaded"`).
 *
 * The browser is responsible for setting the `Content-Type` header to
 * `multipart/form-data; boundary=…`; we MUST NOT set it ourselves
 * (`postMultipart` enforces this).
 *
 * Empty / null metadata fields are simply omitted from the FormData,
 * matching the server's "absent ⇒ NULL" convention.
 */
export function uploadImage(
  file: File,
  metadata: ImageUploadMetadata
): Promise<Image> {
  const form = new FormData();
  form.set("file", file, file.name);
  if (metadata.alt_text != null && metadata.alt_text !== "") {
    form.set("alt_text", metadata.alt_text);
  }
  if (metadata.category_id != null && metadata.category_id !== "") {
    form.set("category_id", metadata.category_id);
  }
  return postMultipart<Image>(`${API_PREFIX}/uploads`, form);
}
