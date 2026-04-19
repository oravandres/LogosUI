import type { QuoteWriteBody } from "@/api/types";

/**
 * Editable shape backing {@link QuoteForm}. Differs from
 * {@link QuoteWriteBody} in that `image_id` and `category_id` are `string`
 * (with `""` meaning "none") rather than `string | null`, so the
 * underlying `<select>` controls bind cleanly.
 *
 * {@link buildQuoteWriteBody} performs the `"" → null` projection at the
 * edge before the body hits the network.
 */
export type QuoteFormValues = {
  title: string;
  text: string;
  author_id: string;
  /** Empty string means "no image". */
  image_id: string;
  /** Empty string means "no category". */
  category_id: string;
};

/** Convenience initial value for create flows. */
export const emptyQuoteFormValues: QuoteFormValues = {
  title: "",
  text: "",
  author_id: "",
  image_id: "",
  category_id: "",
};

/**
 * Map a `Quote` (or quote-shaped row from the list endpoint) into the
 * editable shape used by {@link QuoteForm}. Centralized so the
 * `null → ""` projection cannot drift between callers.
 */
export function quoteToFormValues(q: {
  title: string;
  text: string;
  author_id: string;
  image_id: string | null;
  category_id: string | null;
}): QuoteFormValues {
  return {
    title: q.title,
    text: q.text,
    author_id: q.author_id,
    image_id: q.image_id ?? "",
    category_id: q.category_id ?? "",
  };
}

/**
 * Validate the form values and assemble a {@link QuoteWriteBody} for the
 * API. Pure function so callers that don't render the full form (the
 * inline-edit row on `QuotesPage` is the obvious candidate, should it
 * choose to opt in later) can still share the validation contract
 * verbatim.
 *
 * Validation rules mirror the existing UI exactly so the extraction is
 * behavior-preserving:
 *   - `title.trim()` non-empty
 *   - `text.trim()` non-empty
 *   - `author_id` non-empty (every quote requires an author per the API)
 *
 * Optional fields (`image_id`, `category_id`) are projected from `""` to
 * `null` so the JSON body matches the backend contract.
 */
export function buildQuoteWriteBody(
  v: QuoteFormValues
): { ok: true; body: QuoteWriteBody } | { ok: false; error: string } {
  const title = v.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  const text = v.text.trim();
  if (!text) return { ok: false, error: "Text is required." };
  if (v.author_id === "") {
    return { ok: false, error: "Author is required." };
  }
  return {
    ok: true,
    body: {
      title,
      text,
      author_id: v.author_id,
      image_id: v.image_id === "" ? null : v.image_id,
      category_id: v.category_id === "" ? null : v.category_id,
    },
  };
}
