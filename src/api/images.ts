import { fetchJson, postJson, putJson } from "@/api/client";
import type { Image, ImageWriteBody, PaginatedResponse } from "@/api/types";

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
