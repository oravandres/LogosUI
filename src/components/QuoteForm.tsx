import { useQuery } from "@tanstack/react-query";
import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { listAllCategoriesByType } from "@/api/categories";
import { getImage, listImages } from "@/api/images";
import { AuthorPicker } from "@/components/AuthorPicker";
import {
  buildQuoteWriteBody,
  emptyQuoteFormValues,
  type QuoteFormValues,
} from "@/components/quoteForm.helpers";
import type { QuoteWriteBody } from "@/api/types";

/** Bounded fetch for the optional image picker — same cap as `QuotesPage`. */
const IMAGE_PICKER_LIMIT = 50;

export type QuoteFormMode = "create" | "edit";

export type QuoteFormProps = {
  mode: QuoteFormMode;
  /**
   * Pre-fill values. Required-shaped for callers; the create flow can pass
   * {@link emptyQuoteFormValues} or omit and let the form default to empty.
   * In edit mode, `initialValues` is the canonical source — the form re-syncs
   * its fields whenever the values change identity (e.g. a refetched quote).
   */
  initialValues?: QuoteFormValues;
  /**
   * Called with a validated {@link QuoteWriteBody} once local validation
   * passes. Parent owns the mutation, the success/error toasts, and any
   * cache invalidation; the form only emits the body and surfaces
   * `submitError` back inline.
   */
  onSubmit: (body: QuoteWriteBody) => void;
  /**
   * Called when the user clicks Cancel. Required when `mode === "edit"` —
   * an edit form without a way out is a user trap. Optional for create.
   */
  onCancel?: () => void;
  /** Disables the controls and re-labels the submit button while pending. */
  isSubmitting: boolean;
  /**
   * External error from the parent's mutation. Rendered alongside (not
   * instead of) any local validation error so the user sees both signals.
   */
  submitError?: string | null;
  /**
   * Optional ref to the title input so a parent CTA (e.g. "Create a quote"
   * empty-state button) can scroll-and-focus the form on click. Only used
   * in create mode in practice.
   */
  titleInputRef?: React.Ref<HTMLInputElement>;
  /**
   * Title of the quote being edited, threaded into the field `aria-label`s
   * (`"Title — On Virtue"`, etc.) so multiple editors on the same page —
   * e.g. an inline-edit row plus the detail-page editor opened in another
   * tab — disambiguate for screen-reader and voice-control users. Only
   * meaningful in edit mode; ignored in create mode.
   */
  quoteTitleForA11y?: string;
};

/**
 * Stacked-panel form for creating or editing a quote.
 *
 * Owns all of the field state, the local validation, and the picker queries
 * (categories, images, image-fallback for `initialValues.image_id` outside
 * the bounded picker window). Parents own the mutation: the form just emits
 * a validated body via `onSubmit` and renders the resulting `submitError`
 * inline alongside any validation error.
 *
 * Layout
 * ------
 * The form deliberately renders only the **stacked-panel** layout (used by
 * the create panel on `QuotesPage` and the inline-edit affordance on
 * `QuoteDetailPage`). The table-row inline-edit on `QuotesPage` keeps its
 * own JSX because the table-cell layout, the per-row ARIA labels, and the
 * peer cells (`QuoteTagChips`, `updated_at`) diverge enough that forcing
 * both behind a layout prop would mean a fork that is larger than the
 * duplication it eliminates. The shared logic that *does* matter
 * (validation + body assembly) is exported as {@link buildQuoteWriteBody}
 * so the table-row form can opt into it without dragging the rendering
 * along too.
 *
 * Picker queries
 * --------------
 * - Categories (`["categories", "picker", "quote"]`) and images (`["images",
 *   "picker", IMAGE_PICKER_LIMIT]`) are deduped via React Query's cache key
 *   with the same queries on `QuotesPage`, so two `QuoteForm`s mounted in
 *   the same app share their results.
 * - The image picker is **lazy** (armed on focus, or eagerly when an edit
 *   pre-selects an image) so the create form doesn't ship a fetch for an
 *   optional field the user may never touch.
 * - When `initialValues.image_id` references an image outside the bounded
 *   picker window, `getImage(id)` is called as a single-row fallback and
 *   the resulting option is prepended to the `<select>` so the row's
 *   current value is always selectable. Without this, edit mode on a quote
 *   with a "rare" image would silently drop the image when saved.
 */
export const QuoteForm = forwardRef<HTMLFormElement, QuoteFormProps>(
  function QuoteForm(
    {
      mode,
      initialValues,
      onSubmit,
      onCancel,
      isSubmitting,
      submitError,
      titleInputRef,
      quoteTitleForA11y,
    },
    formRef
  ) {
    const seed = initialValues ?? emptyQuoteFormValues;
    const [values, setValues] = useState<QuoteFormValues>(seed);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Re-seed when the parent swaps `initialValues` identity. In edit mode
    // this happens when the underlying quote refetches; in create mode the
    // parent typically doesn't pass `initialValues`, so this is effectively
    // a no-op there. We deliberately avoid re-seeding on every render by
    // depending on the object identity rather than its fields, so a user
    // mid-typing on the create form isn't trampled by a parent re-render.
    useEffect(() => {
      if (initialValues) {
        setValues(initialValues);
      }
    }, [initialValues]);

    // Eagerly arm the image picker when entering edit with a pre-selected
    // image, so the `<select>` has options to render the current value
    // against without waiting for the user to focus the field. For create
    // (or edit with no image) we stay lazy: focusing the field arms it.
    const [imagePickerArmed, setImagePickerArmed] = useState(
      seed.image_id !== ""
    );
    useEffect(() => {
      if (initialValues && initialValues.image_id !== "") {
        setImagePickerArmed(true);
      }
    }, [initialValues]);

    const categoriesQuery = useQuery({
      queryKey: ["categories", "picker", "quote"],
      queryFn: ({ signal }) => listAllCategoriesByType("quote", signal),
      staleTime: 60_000,
    });

    const imagesPickerQuery = useQuery({
      queryKey: ["images", "picker", IMAGE_PICKER_LIMIT],
      queryFn: ({ signal }) =>
        listImages({ limit: IMAGE_PICKER_LIMIT, offset: 0, signal }),
      enabled: imagePickerArmed,
      staleTime: 60_000,
    });

    const categoryOptions = categoriesQuery.data ?? [];
    const imageOptions = useMemo(
      () => imagesPickerQuery.data?.items ?? [],
      [imagesPickerQuery.data]
    );

    // Fallback lookup so the image `<select>` always has the row's current
    // image as a selectable option, even when it falls outside the bounded
    // picker window (the picker caps at 50; an edited quote can reference
    // any image).
    const imageMissingId = useMemo(() => {
      if (values.image_id === "") return null;
      if (imageOptions.some((img) => img.id === values.image_id)) return null;
      return values.image_id;
    }, [values.image_id, imageOptions]);

    const imageFallbackQuery = useQuery({
      queryKey: ["images", "edit-fallback", imageMissingId],
      queryFn: ({ signal }) => getImage(imageMissingId!, signal),
      enabled: imageMissingId !== null,
      staleTime: 60_000,
    });

    const imageSelectOptions = useMemo(() => {
      const items = [...imageOptions];
      const extra = imageFallbackQuery.data;
      if (extra && !items.some((i) => i.id === extra.id)) {
        items.unshift(extra);
      }
      return items;
    }, [imageOptions, imageFallbackQuery.data]);

    const categoryPickerLoading = categoriesQuery.isPending;
    const imagePickerLoading =
      imagePickerArmed && imagesPickerQuery.isPending;
    const imageFallbackPending =
      imageMissingId !== null && imageFallbackQuery.isPending;

    const setField = <K extends keyof QuoteFormValues>(
      key: K,
      value: QuoteFormValues[K]
    ) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const result = buildQuoteWriteBody(values);
      if (!result.ok) {
        setValidationError(result.error);
        return;
      }
      setValidationError(null);
      onSubmit(result.body);
    };

    const handleReset = () => {
      // Only used by the Cancel button on edit; resets the editable copy
      // back to whatever the parent last seeded. The parent is also
      // responsible for unmounting / hiding the form afterwards via
      // `onCancel`.
      setValues(initialValues ?? emptyQuoteFormValues);
      setValidationError(null);
      onCancel?.();
    };

    const isEdit = mode === "edit";
    const submitLabel = isEdit
      ? isSubmitting
        ? "Saving…"
        : "Save"
      : isSubmitting
        ? "Creating…"
        : "Create";

    // In edit mode we autofocus the title because entering edit was a
    // deliberate user action; in create mode the form is always rendered
    // alongside the list and an autofocus would trap users who landed on
    // the page intending to scroll/read.
    const autoFocusTitle = isEdit;

    const titleA11yLabel =
      isEdit && quoteTitleForA11y
        ? `Title — ${quoteTitleForA11y}`
        : undefined;
    const textA11yLabel =
      isEdit && quoteTitleForA11y
        ? `Text — ${quoteTitleForA11y}`
        : undefined;
    const authorA11yLabel =
      isEdit && quoteTitleForA11y
        ? `Author — ${quoteTitleForA11y}`
        : "Author";
    const imageA11yLabel =
      isEdit && quoteTitleForA11y ? `Image — ${quoteTitleForA11y}` : undefined;
    const categoryA11yLabel =
      isEdit && quoteTitleForA11y
        ? `Category — ${quoteTitleForA11y}`
        : undefined;

    return (
      <>
        <form
          ref={formRef}
          className="form-grid form-grid-quotes"
          onSubmit={handleSubmit}
        >
          <label className="field field-span-2">
            <span className="field-label">Title</span>
            <input
              ref={titleInputRef}
              className="input"
              value={values.title}
              onChange={(ev) => setField("title", ev.target.value)}
              maxLength={500}
              autoComplete="off"
              disabled={isSubmitting}
              autoFocus={autoFocusTitle}
              aria-label={titleA11yLabel}
            />
          </label>
          <label className="field field-span-2">
            <span className="field-label">Text</span>
            <textarea
              className="input textarea"
              value={values.text}
              onChange={(ev) => setField("text", ev.target.value)}
              rows={4}
              disabled={isSubmitting}
              aria-label={textA11yLabel}
            />
          </label>
          <div className="field">
            <span className="field-label">Author</span>
            {!isEdit ? (
              <span className="field-hint muted">
                Type to search authors by name — every author is reachable.
              </span>
            ) : null}
            <AuthorPicker
              value={values.author_id}
              onChange={(id) => setField("author_id", id)}
              disabled={isSubmitting}
              ariaLabel={authorA11yLabel}
            />
          </div>
          <label className="field">
            <span className="field-label">Image</span>
            {!isEdit ? (
              <span className="field-hint muted">
                Optional. Focus to load up to {IMAGE_PICKER_LIMIT} images.
              </span>
            ) : null}
            <select
              className="input"
              value={values.image_id}
              onChange={(ev) => setField("image_id", ev.target.value)}
              onFocus={() => setImagePickerArmed(true)}
              disabled={
                isSubmitting || imagePickerLoading || imageFallbackPending
              }
              aria-label={imageA11yLabel}
            >
              <option value="">None</option>
              {imageSelectOptions.map((img) => (
                <option key={img.id} value={img.id}>
                  {truncateMiddle(img.url, 56)}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-span-2">
            <span className="field-label">Category</span>
            <select
              className="input"
              value={values.category_id}
              onChange={(ev) => setField("category_id", ev.target.value)}
              disabled={isSubmitting || categoryPickerLoading}
              aria-label={categoryA11yLabel}
            >
              <option value="">None</option>
              {categoryOptions.map((c) => (
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
              disabled={isSubmitting}
            >
              {submitLabel}
            </button>
            {isEdit ? (
              <button
                type="button"
                className="btn"
                disabled={isSubmitting}
                onClick={handleReset}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        {/*
         * Picker error notice: deliberately quiet — the form is still
         * usable (the user can pick "None" or type-to-search the author)
         * but the secondary lookups failing is worth surfacing so a
         * reviewer doesn't have to dig into devtools to see why a select
         * is empty.
         */}
        {categoriesQuery.isError ||
        (imagePickerArmed && imagesPickerQuery.isError) ? (
          <p className="error" role="alert">
            Some pickers failed to load. You can retry or refresh to populate
            them.
          </p>
        ) : null}
        {validationError ? (
          <p className="error" role="alert">
            {validationError}
          </p>
        ) : null}
        {submitError ? (
          <p className="error" role="alert">
            {submitError}
          </p>
        ) : null}
      </>
    );
  }
);

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - (max - 1 - half))}`;
}
