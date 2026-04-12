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

/** Matches Logos `model.ImageResponse`. */
export type Image = {
  id: string;
  url: string;
  alt_text: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Matches Logos `model.CreateImageRequest` / `UpdateImageRequest`. */
export type ImageWriteBody = {
  url: string;
  alt_text: string | null;
  category_id: string | null;
};

/** GET /api/v1/health success body. */
export type HealthOk = { status: "healthy" };

/** GET /api/v1/health failure body (503). */
export type HealthErr = { status: "unhealthy"; error: string };
