/** Matches Logos `model.PaginatedResponse`. */
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

/** Matches Logos `model.CategoryResponse`. */
export type Category = {
  id: string;
  name: string;
  type: string;
  created_at: string;
};

/** Matches Logos `model.CreateCategoryRequest` / `UpdateCategoryRequest`. */
export type CategoryWriteBody = {
  name: string;
  type: string;
};

/**
 * Discriminator on the `images.source` column (Logos migration 000008).
 *
 * - `external_url`: the user pasted an http(s) URL Logos doesn't own.
 * - `uploaded`: the user uploaded the file via the multipart endpoint;
 *   bytes are persisted on the Logos blobstore.
 * - `generated`: Logos asked an external generator (DarkBase, later
 *   Sparky) to render the image and keeps the bytes locally.
 */
export type ImageSource = "external_url" | "uploaded" | "generated";

/** Matches Logos `model.ImageResponse`. */
export type Image = {
  id: string;
  url: string;
  alt_text: string | null;
  category_id: string | null;
  /**
   * Optional: older Logos rollouts that haven't applied migration 000008
   * yet may not emit `source`. Treat the absence as `external_url` for
   * forward-compat reasons (the JSON CRUD wire shape is unchanged for
   * that flow).
   */
  source?: ImageSource;
  content_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  prompt?: string | null;
  model?: string | null;
  seed?: number | null;
  generated_at?: string | null;
  created_at: string;
  updated_at: string;
};

/** Matches Logos `model.CreateImageRequest` / `UpdateImageRequest`. */
export type ImageWriteBody = {
  url: string;
  alt_text: string | null;
  category_id: string | null;
};

/**
 * Optional metadata for the multipart upload form. The `file` itself is
 * passed alongside this object to `uploadImage()` because `File` is not
 * JSON-serialisable.
 */
export type ImageUploadMetadata = {
  alt_text: string | null;
  category_id: string | null;
};

/** Matches Logos `model.AuthorResponse`. */
export type Author = {
  id: string;
  name: string;
  bio: string | null;
  born_date: string | null;
  died_date: string | null;
  image_id: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Matches Logos `CreateAuthorRequest` / `UpdateAuthorRequest`. */
export type AuthorWriteBody = {
  name: string;
  bio: string | null;
  born_date: string | null;
  died_date: string | null;
  image_id: string | null;
  category_id: string | null;
};

/** Matches Logos `model.QuoteResponse`. */
export type Quote = {
  id: string;
  title: string;
  text: string;
  author_id: string;
  image_id: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Matches Logos `CreateQuoteRequest` / `UpdateQuoteRequest`. */
export type QuoteWriteBody = {
  title: string;
  text: string;
  author_id: string;
  image_id: string | null;
  category_id: string | null;
};

/** Matches Logos `model.TagResponse`. */
export type Tag = {
  id: string;
  name: string;
  created_at: string;
};

/** Matches Logos `model.CreateTagRequest`. */
export type TagWriteBody = {
  name: string;
};

/** GET /api/v1/health success body. */
export type HealthOk = { status: "healthy" };

/** GET /api/v1/health failure body (503). */
export type HealthErr = { status: "unhealthy"; error: string };
