import { fetchJson, postJson, postMultipart, putJson } from "@/api/client";
import type {
  GenerateImageBody,
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

/**
 * Static catalog of image-generation model identifiers the UI exposes
 * in the Generate tab.
 *
 * The list is intentionally a const array rather than a runtime fetch
 * because:
 *
 *  1. The Logos backend currently has no discovery endpoint that
 *     reflects what its configured `imagegen` provider can render. The
 *     canonical names live across DarkBase and Sparky API contracts;
 *     hard-coding the union here matches what's already deployed and
 *     keeps the UI from making an extra request on every panel mount.
 *  2. The Generate tab is internal-admin surface; if a name needs to
 *     change, the `images:generate` request body is a free-form string
 *     so callers stay forward-compatible — the dropdown is just the
 *     curated subset shown in the picker.
 *
 * If the backend grows a `GET /api/v1/images:generate/models` endpoint
 * later, swap this for a `useQuery` and keep the same `id` shape.
 */
export const IMAGE_GEN_MODELS = [
  { id: "flux2-dev", label: "FLUX2-dev (default)" },
  { id: "flux2-klein", label: "FLUX2-klein" },
  { id: "qwen-image", label: "Qwen-Image" },
  { id: "hunyuanimage-3-instruct", label: "HunyuanImage-3-instruct" },
] as const;

export const DEFAULT_IMAGE_GEN_MODEL_ID: (typeof IMAGE_GEN_MODELS)[number]["id"] =
  "flux2-dev";

/**
 * Trigger a synchronous image generation against the configured Logos
 * backend.
 *
 * Wire shape: `POST /api/v1/images:generate`, JSON body matching
 * `GenerateImageBody`. On success the server returns the persisted
 * `Image` row with `source: "generated"` and `url` pointing at the
 * same-origin blob endpoint.
 *
 * The request is intentionally synchronous (single round-trip), in
 * line with the plan's "sync-blocking with a 60s deadline" decision —
 * the UI shows a spinner while it's pending. `signal` lets a caller
 * abort if the user navigates away or supersedes the request.
 */
export function generateImage(
  body: GenerateImageBody,
  signal?: AbortSignal
): Promise<Image> {
  return postJson<Image>(`${API_PREFIX}:generate`, body, { signal });
}
