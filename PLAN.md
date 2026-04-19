# LogosUI — Implementation Plan

## Overview

LogosUI is the React + TypeScript frontend for the [Logos](https://github.com/oravandres/Logos) API. It's built with Vite, consumes the REST API via `@tanstack/react-query`, and is designed to ship to the MiMi K3s cluster as a tiny nginx-served static bundle on the same host as the API (no CORS in production).

This document tracks what is done, what is next, and how we get the UI deployed to the cluster.

---

## 1. Current Status (shipped)

| Area | State |
|------|-------|
| App shell | Vite + React 19 + TS, router, `Layout` with top nav |
| API client | `fetchJson` / `postJson` / `putJson`, typed `ApiError`, configurable base URL |
| Resource pages | `categories`, `images`, `authors`, `quotes`, `tags` — full CRUD with inline edit + paginated list + filter/search |
| `AuthorPicker` | Debounced async combobox, full ARIA keyboard contract (arrow/Home/End/Enter/Escape), display-name resolution |
| Per-quote tags | Chip display + inline editor with parent-404 / child-422 / read-error handling |
| Home dashboard | Corpus counts + recent quotes with resolved author names |
| Tests | Vitest + RTL, 131 tests across 18 suites (all passing at time of writing) |
| Lint / typecheck | ESLint, `tsc --noEmit` clean |
| Cursor rules | Picker reachability, combobox a11y, sub-resource editor lessons captured in `.cursor/rules/` |

What is **not** shipped:

- No global search.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript 5.7 (strict) | Matches AGENTS.md expectations |
| UI | React 19 + React Router 7 | Current stable, data-router ergonomic |
| Bundler | Vite 6 | Fast dev + small production bundles |
| Data fetching | `@tanstack/react-query` v5 | Cache, cancellation, invalidation |
| Validation | `zod` | Already a dependency; used at API boundaries where needed |
| Tests | Vitest + Testing Library + `jsdom` | Matches ecosystem best practice |
| Serving | nginx unprivileged static server in container | Tiny image, deterministic, widely understood |
| Containerization | Multi-stage (node build → nginx runtime) | ~30–40 MB image |

---

## 3. Next Development Phases

### ~~Phase A — Combobox primitive refactor~~ _(shipped)_

Lifted the keyboard contract previously inlined in `AuthorPicker` into a shared `<Combobox>` primitive. Future pickers compose it instead of forking the contract; the rule in `.cursor/rules/12-pr-review-lessons.mdc` now points at `src/components/Combobox.tsx`.

- `src/components/Combobox.tsx` owns the WAI-ARIA combobox contract (Arrow/Home/End/Enter/Escape, `aria-activedescendant`, `onMouseDown` preventDefault, auto-scroll, active/selected styles, header/footer/empty-state slots).
- `AuthorPicker` is now a thin search/resolve adapter on top of the primitive — public API unchanged.
- Direct unit tests for the primitive in `Combobox.test.tsx` cover ARIA wiring, keyboard navigation, mouse commit, hover sync, custom rendering, and slot composition.

### ~~Phase B — Quote detail view~~ _(shipped)_

Dedicated read-oriented page at `/quotes/:id` rendering:

- Title, full text (paragraphs preserved), author block (name + bio + life span + portrait resolved through `author.image_id`), optional quote image, category chip, read-only tag chips, and created/updated timestamps.
- **Delete** action gated behind a `window.confirm`, which then invalidates `["quotes"]` / `["home"]`, evicts `["quote", id]` and `["quote-tags", id]`, and navigates back to `/quotes` so a back-button never re-renders the deleted quote from cache.
- 404 on the quote itself shows a friendly "Quote not found" page; auxiliary lookups (portrait, category, tag list) degrade gracefully without tearing down the page.
- Cache keys are aligned with the home dashboard (`["author", id]`) and the quotes list (`["quote-tags", id]`) so the same fetch backs every view.
- Title links: `HomePage` recent-quote titles and the `QuotesPage` row title cell now `<Link>` straight to `/quotes/:id`.

### Phase B.1 — Filtered-list deep links and inline edit on the detail page

Split out of Phase B because each requires plumbing that did not exist at the time Phase B shipped. Sliced into three independently-shippable PRs:

#### ~~B.1a — URL search params + tag filter on `QuotesPage`~~ _(shipped)_

- `QuotesPage` filter and pagination state (`category_id`, `author_id`, `tag_id`, `title`, `offset`) is now **derived directly** from `useSearchParams` — the URL is the actual source of truth, not a mirror of local state. Browser back/forward, programmatic `navigate('?…')`, and deep links from `QuoteDetailPage` all flow into the list with zero hydration glue. The only piece of local state left is `titleInput`, the editable draft for the search box; a debounced effect commits it into `?title` (and resets `?offset`) once the user stops typing, and a sibling effect syncs the draft back to `appliedTitle` whenever `?title` changes externally so the search box reflects the active filter on back/forward.
- All filter and pager mutations go through a single `updateSearchParams(mutator)` helper that calls `setSearchParams(..., { replace: true })`, so the back stack stays clean and concurrent updates never race over a stale snapshot of the URL. Empty values are deleted from the URL rather than serialized as `&category_id=&tag_id=`, keeping shareable links readable.
- `parseOffsetParam` enforces a strict `/^\d+$/` match on the whole string so tampered or surprising values like `?offset=-1`, `?offset=20foo`, `?offset=3.14`, `?offset=1e2`, or `?offset=+5` all clamp to `0`. `Number.parseInt`'s lenient "consume-leading-digits" behavior is **not** sufficient on its own — a regex is the only way to enforce the documented contract.
- `listQuotes({ tagId })` plumbs through to the new backend `?tag_id=` filter (Logos hashed semi-join — coordinated server-side change, see Logos `12-pr-review-lessons.mdc`). A plain `<select>` tag picker — populated by the existing `["tags", "all"]` query, so opening the per-row tag editor on the same view does not refetch — sits next to the Category filter in the toolbar.
- When a deep-link's `?tag_id` references a tag that the picker no longer lists, the controlled `<select>` renders a synthetic disabled `(deleted tag)` option so it stays in sync with the active filter — **only when** `listAllTags()` was exhaustive (`!truncated`). The helper caps at 500 items, so under truncation a valid deep link to a tag past the cap would otherwise be mislabeled as deleted; in that case we render no sentinel and the controlled `<select>` falls back to the placeholder visually while `tagFilterId` continues to drive the API call correctly.
- `tagFilterId` was threaded through the list query key, the delete-mutation `stillOnSameView` comparison, `clearFilters`, and `hasActiveFilter` so every existing invariant continues to hold. The delete-onSuccess clamp now `flushSync`s a `setSearchParams` transition (instead of a `setOffset` state update) so the dependent list query key is committed before `invalidateQueries` triggers the refetch — otherwise the refetch would go out with the stale offset.
- Tests: 10 new specs in `QuotesPage.test.tsx` cover URL hydration → first `listQuotes` call; the `?offset=-1` clamp and the strict-integer rejection of `20foo` / `3.14` / `1e2` / `+5`; `replace`-only mirroring (pristine URL stays pristine until a filter is touched); the "Clear filters" path stripping every param off the URL; the `(deleted tag)` sentinel for missing tag deep links; the **non-rendering of the sentinel when the tag corpus is truncated**; the tag-filter dropdown driving both the API call and the URL; **search-only navigation while QuotesPage stays mounted** firing a fresh `listQuotes` with the new filters; and the editable search-box draft syncing to `?title` on external navigation. Total suite: **146/146 passing**. ESLint, `tsc --noEmit`, and `vite build` clean.

#### ~~B.1b — Deep links from `QuoteDetailPage`~~ _(shipped)_

- `AuthorBlock` now renders a quiet `View all quotes by this author →` link beneath the author dates, pointing at `/quotes?author_id=<author.id>`. The link is gated on the author query having resolved successfully — while the lookup is pending we have no human-readable name yet, and on a 4xx/5xx we cannot confirm the author still exists, so a generic "this author" label would be either useless to a screen-reader user navigating by links alone or actively misleading. The accessible name embeds the resolved author name (`aria-label="View all quotes by Aristotle"`) so it is unambiguous out of context.
- `TagList` now renders each chip as a `<Link className="tag-chip tag-chip-link">` pointing at `/quotes?tag_id=<tag.id>`, with `aria-label='View all quotes tagged "<name>"'` for the same reason. The visible chip text stays the bare tag name; the chip styling carries through, with a `:hover` / `:focus-visible` background swap (`--accent-soft-bg-strong`) and a `:focus-visible` outline so keyboard navigation is visible.
- A small `listLink({ author_id?, tag_id? })` helper builds the deep-link href via `URLSearchParams` so opaque ids — which the API contract treats as **opaque strings**, not slugs — are encoded defensively. This is not theoretical: a future id like `a&b=c` would otherwise inject a second filter into the deep link and the destination list would come up with the wrong rows. Always points at `/quotes` so the destination is stable across nested routes.
- The deep link only emits the **single filter the user clicked on**: clicking the wisdom chip on a quote that also has a category set still produces `/quotes?tag_id=t-1`, not `?tag_id=t-1&category_id=…`. Stacking the quote's other facets onto the link would be a footgun — the user is asking for "more like this tag", not "more like this exact quote", and cross-facet `AND`s tend to collapse the result set to one row (the quote they just came from).
- Added 6 specs to `QuoteDetailPage.test.tsx`: the author link href + accessible name on the happy path; the link's absence while the author is pending and on author-fetch error; per-tag chip hrefs and accessible names; URL-encoding of `&`, `=`, `/`, and spaces in both author and tag ids; and an end-to-end click that lands the user on the `/quotes` route stub. Total suite: **153/153 passing**. ESLint, `tsc --noEmit` (both projects), and `vite build` all clean.

#### ~~B.1c — Extract `<QuoteForm>` and inline edit on the detail page~~ _(shipped)_

- `src/components/QuoteForm.tsx` is the new home of the stacked-panel quote form, with a `mode: "create" | "edit"` API. The component owns its field state, local validation, the categories picker (`["categories", "picker", "quote"]`), the lazy image picker (`["images", "picker", 50]`), and the single-row image fallback (`getImage(id)`) for `initialValues.image_id` outside the bounded picker window — so a quote with a "rare" image can round-trip through edit mode without silently dropping the image on save. Picker queries dedupe via React Query's cache key with the same queries `QuotesPage` still issues for the toolbar / inline-edit row.
- Validation and `QuoteWriteBody` assembly live in a sibling `src/components/quoteForm.helpers.ts` (`buildQuoteWriteBody(values)`, `quoteToFormValues(quote)`, `emptyQuoteFormValues`). Splitting the helpers out of the `.tsx` file keeps `QuoteForm.tsx` HMR-clean (`react-refresh/only-export-components`) and makes the validation contract directly importable by callers that don't render the full form.
- `QuotesPage` now renders `<QuoteForm mode="create">` for the top "Create quote" panel. Reset semantics moved from per-field `setForm*("")` calls to a `key={createFormKey}` remount in `createMutation.onSuccess`, so the form clears every controlled field (title, text, author, image, category) without exposing an imperative `reset()` surface. The empty-state CTA still focuses the title input via a `useRef` threaded through `titleInputRef={createTitleInputRef}` — the ref re-attaches across the post-create remount.
- **The inline-edit table row on `QuotesPage` deliberately stays as-is.** The table-cell layout, the per-row ARIA labels, and the peer cells (`QuoteTagChips`, `updated_at`) diverge enough from the stacked-panel form that forcing both behind a layout prop would mean a fork that is larger than the duplication it eliminates. `buildQuoteWriteBody` is exported so the row can opt into the shared validation contract later without dragging the rendering along too.
- `QuoteDetailPage` now has an in-page **Edit** affordance: a header button opens an `Edit quote` panel containing `<QuoteForm mode="edit" initialValues={quoteToFormValues(quote)} quoteTitleForA11y={quote.title} …>`. Edit / Delete are hidden while editing because the form has its own Save / Cancel button bar — surfacing both at once would let the user click Edit twice or Delete the row mid-edit, both of which are user traps. The h2 stays visible so the screen-reader page heading and the visible context don't disappear when entering edit mode.
- `updateMutation.onSuccess` writes the fresh quote into `["quote", id]` directly via `setQueryData(updated)` so the read-mode panels re-render against the new state on the same tick we exit edit mode, without waiting for a roundtrip. Downstream resolver queries (`["author", new]`, `["image", new]`, `["category", new]`) auto-refire because their query keys change when the quote's foreign-key ids change. `["quotes"]` and `["home"]` are invalidated so the list view and dashboard reflect the new title / classification on the next visit. On error, the form stays mounted with the user's draft intact, the server message is rendered inline via `submitError`, and a toast surfaces it for users whose attention is elsewhere on the page.
- Field-level accessibility in edit mode: `quoteTitleForA11y={quote.title}` threads through to `aria-label="Title — On Virtue"` etc. on the title / text / author / image / category fields, so a screen-reader or voice-control user with multiple editors open (e.g. an inline-edit row plus the detail page in another tab) can disambiguate. The autofocus-on-mount behavior is also mode-aware: edit autofocuses the title because entering edit was a deliberate user action; create does not, because the create form sits alongside the list and an autofocus would trap users who landed on the page intending to scroll/read.
- Tests: `QuoteForm.test.tsx` (26 specs) covers `buildQuoteWriteBody` validation rules + `null` projection, `quoteToFormValues` mapping, create-mode validation per rule, the projected `QuoteWriteBody` shape on submit, no-autofocus in create vs autofocus in edit, hint visibility, Cancel button presence, `submitError` rendering, `isSubmitting` button + field disabling, `titleInputRef` forwarding for the empty-state CTA, `quoteTitleForA11y` aria threading on every field, Save/Cancel callback wiring, eager image-picker arming when seeded with an image, the single-row fallback for an out-of-window `image_id`, and re-seeding when `initialValues` identity changes (parent refetch). 6 new specs in `QuoteDetailPage.test.tsx` cover Edit button presence + name, mounting `<QuoteForm>` seeded from the quote with Edit/Delete hidden, Cancel exiting without an API call, Save submitting the projected body and re-painting the h2 from the cache write, local validation blocking the save, and a server-error path that keeps the form mounted so the user can retry. The obsolete `Edit in list` link test was removed (replaced by the proper edit-affordance suite). Total suite: **184/184 passing** (was 153 before B.1c — +31 net new specs). ESLint, `tsc --noEmit` (both projects), and `vite build` all clean.

This closes Phase B.1.

### ~~Phase C — Global polish~~ _(shipped)_

Sliced into three independently-shippable PRs. All three landed.

#### ~~C.1 — Router error boundary + toasts~~ _(shipped)_

- `<ErrorBoundary>` (class component) wraps the routed `<Outlet />` inside `Layout`, so a thrown render error in any page shows a friendly fallback while the header/nav stay rendered. The raw error message is **not** surfaced to the user (no internal leakage); it is logged via `console.error("[ui] render error", { name, message, componentStack })` for future RUM wiring.
- `<ToastProvider>` (in `Layout`) plus `useToast()` (`src/components/useToast.ts`) expose `success` / `info` / `error(msg, err?)` / `dismiss`. Two live regions are rendered: `role="status" aria-live="polite"` for success/info, `role="alert" aria-live="assertive"` for errors. Toasts auto-dismiss (4s success/info, 7s error), are capped at 4 visible (oldest dropped), and respect `prefers-reduced-motion`.
- Every `useMutation` across the six pages now toasts: `success("Quote \"…\" created")` etc. on success, and `error("Could not create quote", err)` on failure (alongside the existing inline banner — the toast is additive, the banner is not removed).
- Tests: `ErrorBoundary.test.tsx` (4) + `ToastProvider.test.tsx` (7) + integration assertions in `CategoriesPage.test.tsx`. Total suite: 94/94 passing.

#### ~~C.2 — Skeleton loaders + empty-state CTAs~~ _(shipped)_

- `<Skeleton>` primitive (`src/components/Skeleton.tsx`) renders `rect` / `text` / `circle` placeholder blocks with a shimmer that respects `prefers-reduced-motion` (the animation is stripped and the block degrades to a flat muted fill). Decorative by default (`aria-hidden="true"`); callers pass `ariaLabel` when the skeleton is the only signal and needs to be wrapped in a polite live region.
- `<ListSkeleton rows={n} ariaLabel="Loading …">` renders a stack of two-line skeleton rows, owns the `role="status" aria-live="polite"` announcement, and replaces the `"Loading…"` string on every list panel that renders `<ListSkeleton>` before any page has loaded.
- **Replacements applied**:
 - `HomePage`: each `StatCard` pending pip is now a `<Skeleton width="2.5rem" height="1.5rem" />`. The `aria-label` still carries `"Quotes: 12"` / `"Quotes: loading"` / `"Quotes: —"` so screen readers and the existing tests both see a stable label. Recent quotes loading state uses `<ListSkeleton rows={3} />` instead of `"Loading…"`.
 - `CategoriesPage`, `ImagesPage`, `AuthorsPage`, `QuotesPage`, `TagsPage`: initial list loading uses `<ListSkeleton rows={5}>` with the right `ariaLabel`. Existing "Updating…" fetch hint on top of cached data is unchanged — we still keep the table visible during refetches.
 - `QuoteDetailPage`: top-level `"Loading…"` is a shaped `<QuoteDetailSkeleton>` (title + body + meta block). Author loading state shows three stacked skeleton lines inside the author card; image slot uses a full-width `<Skeleton variant="rect">`; category and tag-list cells use inline skeletons.
- `<EmptyState>` (`src/components/EmptyState.tsx`) renders a dashed panel with an optional title, description, and action row. Callers pass action buttons so pages can offer context-appropriate CTAs without the component knowing about routing or form refs.
- **Empty-state CTAs**:
 - Each list page's create form's primary input now has a `ref`. When the full list is empty, the page renders an `<EmptyState>` like `"No categories yet — Create a category"` whose button calls `ref.current?.focus()`, scrolling the form into view and focusing the first field.
 - Pages that expose filters (`CategoriesPage` type, `ImagesPage` category, `AuthorsPage` search + category, `QuotesPage` title + author + category) render a **filter-aware** empty state when the filtered view comes back empty but filters are active: `"No X match your filters"` with a `Clear filters` button that resets every filter (and search input + debounced applied-search + last-applied ref for the search-based pages) in one click, then snaps back to `offset = 0`.
 - `HomePage` already had `"No quotes yet — Create one."` and is unchanged.
- Tests: new `Skeleton.test.tsx` (5) and `EmptyState.test.tsx` (2); `TagsPage.test.tsx` gains a loading-skeleton test and an empty-state CTA test; `CategoriesPage.test.tsx` gains both the filter-aware `Clear filter` path and the create-CTA empty state. Total suite: 107/107 passing. Lint, `tsc --noEmit`, and `vite build` all clean.

#### ~~C.3 — Dark mode~~ _(shipped)_

- Dark mode ships via `prefers-color-scheme` with no runtime toggle in v1 — the OS preference is the single source of truth, which keeps the surface area small and avoids shipping a theming context, a storage key, and a flash-of-unstyled-content guard.
- `src/index.css` now carries a **semantic CSS custom-property palette** on `:root`. Tokens are named by role (`--bg-page`, `--bg-panel`, `--text-primary`, `--text-muted`, `--border-subtle`, `--accent`, `--accent-soft-bg`, `--success-bg`, `--error-text-strong`, `--input-bg`, `--btn-primary-bg`, `--skeleton-base`, `--shadow-panel`, …), not hue, so component rules stay stable across palette evolutions.
- A `@media (prefers-color-scheme: dark) { :root { … } }` block redefines the same token set with a dark palette (deep slate surfaces, softer borders, darker status panels, inverted skeleton shimmer, stronger shadows). Every component rule already reads colors through `var(--token)`, so the override flips the entire UI — header, nav, panels, tables (incl. hover and inline-edit rows), forms, buttons, toasts, empty states, combobox listbox + hover/active/selected states, chips, portrait fallback, skeletons, error-fallback — without a single site-specific override.
- `:root { color-scheme: light dark; }` is declared so the user-agent chrome (scrollbars, native form controls, canvas default) follows the active palette.
- Palette contract regression test in `src/test/palette.test.ts` reads the stylesheet and asserts that (a) `:root` declares `color-scheme: light dark`, (b) a `@media (prefers-color-scheme: dark)` override exists and redefines the load-bearing tokens (`--bg-page`, `--bg-panel`, `--bg-header`, `--text-primary`, `--text-body`, `--text-muted`, `--border-subtle`, `--input-bg`, `--input-text`, `--btn-primary-bg`, `--skeleton-base`), and (c) no component rule carries a raw hex — every color outside the two palette declarations flows through `var(--token)`. Total suite: **113/113 passing**. Lint, `tsc --noEmit`, and `vite build` clean.
- No markup or component API changed; only `src/index.css` was touched (plus the new palette test). No runtime toggle, no theme provider, no local-storage key, no hydration flash — trivial to revisit later if a user-facing toggle becomes a requirement.

### ~~Phase D — Observability~~ _(shipped)_

- `src/api/logger.ts` exposes `logApiError(err, ctx)` and `isAbortLike(err)`. Every event is a single structured `console.error("[ui] api error", { source, key, name, message, status, method, path, requestId })` so future RUM wiring can replace the sink without touching call sites. The response body and request payload are deliberately **not** logged — they can carry user-entered text or other PII.
- `ApiError` now carries optional `path`, `method`, and `requestId` fields populated by `fetchJson`. The constructor signature is backward compatible (`new ApiError(message, status, body, meta?)`), so the existing test fixtures and any direct construction sites keep working.
- `fetchJson` reads `X-Request-Id` from the response headers (case-insensitive, empty values treated as absent) and threads it onto the thrown `ApiError`. The UI does not yet **send** an outbound `X-Request-Id` header — that is deferred until Logos starts emitting one server-side, per the original "coordinate with Logos first" caveat. When the backend lands the header, the field flows through automatically with no further UI change.
- `src/api/queryClient.ts` exports `createAppQueryClient()` which wires `QueryCache.onError` (`source: "query"`, `key: queryKey`) and `MutationCache.onError` (`source: "mutation"`, `key: mutationKey`) into `logApiError`. Per-call `onError` callbacks still run for UI behavior (toast, inline banner); this layer is purely for observability. Aborted requests (route changes, debounced supersedes) are skipped silently so navigation does not produce a stream of misleading "errors".
- Tests: `src/api/logger.test.ts` (8) covers the structured shape, the abort skip, the unknown-error fallback, and a defense-in-depth check that no response-body content leaks into the log payload. `src/api/client.test.ts` (6) covers `ApiError` carrying `path`/`method`/`requestId`, GET defaulting, empty `X-Request-Id` handling, non-JSON failure responses, and that `postJson` still sets `Content-Type: application/json`. `src/api/queryClient.test.ts` (3) covers the cache callbacks for queries and mutations, plus the abort skip path. Total suite: **131/131 passing**. ESLint and `tsc --noEmit` clean across both tsconfig projects.

### Phase E — Stretch _(future)_

- Bulk operations (multi-select rows → bulk delete / bulk add tag).
- CSV export from list pages.
- Keyboard shortcuts for power users (`/` to focus search, `n` to create).
- Full-text search once the backend exposes it.

**Rough ordering:** A → B → C → D, then E as user feedback dictates. A and B are independently shippable and do not conflict. B.1 can interleave with C without conflict.

---

## 4. Deployment to the MiMi Cluster _(the missing piece)_

Right now the backend lives at `https://logos.mimi.local/api/v1`. The UI is not deployed at all. The plan is to co-host the UI on the **same host** as the API so the browser treats API calls as same-origin — which eliminates the CORS surface in production entirely.

### ~~4.1 Containerization~~ _(shipped)_

- `Dockerfile` (multi-stage): `node:22.12-alpine` builder runs `npm ci` then `npm run build` with `VITE_LOGOS_API_BASE_URL` baked in via `ARG` (default `https://logos.mimi.local`); runtime is `nginxinc/nginx-unprivileged:1.29.4-alpine` listening on `8080` as UID 101 (compatible with the cluster's `restricted` PodSecurity baseline). Builder is pinned to `--platform=$BUILDPLATFORM` because the static bundle is architecture-independent — only the nginx layer needs to be multi-arch.
- `deploy/nginx.conf` ships three matching locations and the canonical SPA-server safety rules:
  - `^~ /assets/` → `Cache-Control: public, max-age=31536000, immutable`, and `try_files $uri =404` so a renamed chunk after a deploy surfaces as a 404 instead of falling through to the HTML shell (which would then fail to parse as JS).
  - `/favicon.ico` and `/robots.txt` → `Cache-Control: public, max-age=3600` (never `immutable`; filenames are not hashed).
  - `/` → `try_files $uri /index.html`, `Cache-Control: no-store`. Deep links resolve in the browser.
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` are repeated in **every** location because nginx's `add_header` is not inherited from a parent block when the child block defines any `add_header` directive of its own. (Caught during local smoke testing — easy to regress.)
- `.dockerignore` strips `node_modules`, `dist`, `.git`, `.github`, `.cursor`, `.env*` (except `.env.example`), `PLAN.md`, `README.md`, `AGENTS.md`, and IDE/OS junk.
- Verified locally: `docker build` succeeds (lint, `tsc -b`, `vite build`, nginx packaging — all clean inside the container); the running container serves the SPA on `:8080`, deep links resolve via the SPA fallback, hashed assets ship a single `Cache-Control: immutable` header, the security headers appear on every response, and the process runs as `uid=101(nginx)`. Image size: ~82 MB.

### ~~4.2 CI + GHCR multi-arch publish~~ _(shipped)_

- A single `.github/workflows/ci.yml` covers both validation and publish so the GHCR image is always gated on a passing build of the same commit. Triggers on `pull_request` and `push: main`.
  - Job `test-and-build`: pins Node via `.nvmrc` (currently `22`), uses `actions/setup-node@v4` with `cache: npm`, then runs `npm ci` → `npm run lint` → `npm test` → `npm run build` (with `VITE_LOGOS_API_BASE_URL=https://logos.mimi.local`). `npm run build` is `tsc -b && vite build`, so it covers both tsconfig projects (app + node) for typecheck.
  - Job `container` (`needs: test-and-build`): always builds the image for `linux/amd64` with `--load` and runs a real smoke test against the running container — non-root UID 101, `index.html` cache + security headers, SPA fallback for deep links, exactly one `Cache-Control: immutable` line on hashed assets, and `/assets/missing.js` returning 404 (no fallthrough to the HTML shell). The smoke test catches Dockerfile / nginx regressions at PR time. On `push: main` the same job then builds multi-arch (`linux/amd64,linux/arm64`) and pushes to GHCR using `docker/login-action@v3` with `${{ secrets.GITHUB_TOKEN }}` and a short-SHA tag from `docker/metadata-action@v5`. Multi-arch is mandatory because the cluster mixes amd64 with Raspberry Pi arm64 nodes; a single-platform tag would fail rollouts on arm64 with `no match for platform in manifest` (workspace rule `12-pr-review-lessons.mdc`). buildx `cache-from`/`cache-to: type=gha` keeps the second build incremental.
- Image repo: `ghcr.io/oravandres/logosui/logos-ui`.

### ~~4.3 MiMi manifests — new `logos-ui` namespace~~ _(shipped)_

Landed on MiMi `main` via PR #3 (`feat/logos-ui-deployment`, two commits — initial scaffold then a follow-up that drops the projected ServiceAccount token and closes the pod-security override gaps the Kyverno review surfaced). A separate namespace (not a shared `logos`) keeps the failure domain clean and means the UI's quota doesn't squeeze the API. The namespace inherits the same baseline controls as every other namespace in the cluster (Namespace with `pod-security.kubernetes.io/enforce: restricted`, ResourceQuota, LimitRange — see `rules/12-pr-review-lessons.mdc`) and is added to all five existing Kyverno `ClusterPolicy` namespace selectors so the cluster's safety gates apply uniformly.

| File | Purpose |
|------|---------|
| `namespace.yaml` | Namespace `logos-ui` with `part-of: logos` and the restricted PSS label |
| `resourcequota.yaml` | Tight quota (500m CPU / 256Mi memory requests, 1 CPU / 512Mi limits, 5 pods) — UI is stateless static content |
| `limitrange.yaml` | Container defaults sized for nginx static serving (25m/32Mi req, 50m/64Mi default limits) |
| `deployment.yaml` | 2 replicas, image pinned to `ghcr.io/oravandres/logosui/logos-ui:db27061`, `imagePullPolicy: IfNotPresent`, RollingUpdate `maxUnavailable: 0` `maxSurge: 1`, restricted pod-level `securityContext` (`runAsNonRoot`, `runAsUser: 101`, seccomp `RuntimeDefault`), container-level `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`, three emptyDir tmpfs mounts for nginx scratch space (`/var/cache/nginx`, `/var/run`, `/tmp`), startup + readiness probes on `GET / :8080` (no liveness — nginx static has no recoverable failure mode that a restart would fix), and `topologySpreadConstraints` on `kubernetes.io/hostname` so the two replicas land on different nodes when possible |
| `service.yaml` | ClusterIP `logos-ui` on port 80 → targetPort 8080 |
| `pdb.yaml` | PodDisruptionBudget with `minAvailable: 1` so voluntary disruptions don't drop the UI |

No Secrets / SealedSecrets needed — static bundles carry no secrets (rule in `AGENTS.md`).

### ~~4.4 Ingress — sibling Ingress on the shared host~~ _(shipped)_

Took option (b) from §7: a sibling `manifests/logos-ui/ingress.yaml` in the new namespace, leaving `manifests/logos/ingress.yaml` untouched. Each namespace owns its own Ingress, so GitOps diffs and PSS / Kyverno boundaries stay clean. cert-manager issues a separate `logos-ui-tls` Secret for the same hostname (Secrets cannot cross namespaces); both certs are signed by the internal CA and Traefik picks either for SNI. The effective routing collapses to the same shape:

```yaml
- host: logos.mimi.local
  http:
    paths:
      - path: /api/v1
        pathType: Prefix
        backend:
          service:
            name: logos-api
            port:
              number: 8000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: logos-ui
            port:
              number: 80
```

Traefik evaluates more specific prefixes first, so `/api/v1` continues to hit the API and everything else falls through to the UI. Because API and UI share the origin, the browser never issues a cross-origin preflight.

The ingress is annotated with `cert-manager.io/cluster-issuer: mimi-internal-ca` — no change.

### ~~4.5 CORS — shrink to dev-only~~ _(shipped)_

Because production is same-origin, the API's `CORS_ALLOWED_ORIGINS` env var only needs to cover local dev origins (`http://localhost:5173,http://127.0.0.1:5173`) — which is what it already is on the cluster. Documented in `README.md` §"Deployment" with an explicit "do not widen to bake the prod origin in" warning so the same-origin invariant doesn't get silently undone.

### ~~4.6 Argo CD Application~~ _(shipped)_

`manifests/argocd-apps/logos-ui-app.yaml` mirrors `logos-app.yaml`:

- `spec.source.path: manifests/logos-ui`
- `spec.destination.namespace: logos-ui`
- `sync-wave: "5"` (after `logos-app` at `"4"`; the UI does not require the API to be ready at boot — it talks to the API at request time — but ordering keeps a fresh-cluster bootstrap predictable).
- `syncPolicy.automated` + `selfHeal` + `CreateNamespace=true`.
- The Kyverno-policies app (`kyverno-policies`, sync-wave `0`) syncs first, so the namespace-selector extension is in place before the `logos-ui` workload pods are admitted.

### 4.7 Rollout sequence

1. ~~Merge this plan doc + scaffolding PR.~~ _(shipped: Phases A–C, plan doc on `main`.)_
2. ~~PR: add `Dockerfile`, `deploy/nginx.conf`, `.github/workflows/ci.yml`. CI validates on every push; the first `main` push after merge publishes `ghcr.io/oravandres/logosui/logos-ui:<sha>`.~~ _(shipped, GHCR tag `db27061`.)_
3. ~~PR to MiMi: add `manifests/logos-ui/*` with `image: ghcr.io/oravandres/logosui/logos-ui:db27061` pinned to the SHA from step 2, add a sibling ingress in `manifests/logos-ui/`, add `manifests/argocd-apps/logos-ui-app.yaml`, and extend the five Kyverno `ClusterPolicy` namespace selectors to cover `logos-ui`.~~ _(shipped: MiMi PR #3 merged to `main`; `yamllint` + `kubeconform` clean; Kyverno-review follow-up dropped the projected ServiceAccount token and tightened the pod-security overrides.)_
4. ~~Verify in-cluster after MiMi PR merges and Argo CD syncs: `https://logos.mimi.local/` loads the SPA; `https://logos.mimi.local/api/v1/health` still returns `{"status":"healthy"}`; deep links (`/quotes`, `/authors/...`) resolve via the SPA fallback.~~ _(shipped.)_ Verified against the live cluster via `curl --resolve logos.mimi.local:443:192.168.1.80`:
    - `Application/logos-ui` → `Synced`, last operation `Succeeded`. The Argo `Application` reports `Progressing` overall because the `Ingress` resource has no controller-published `.status.loadBalancer.ingress[].hostname` (Traefik on K3s never sets it), but every child resource (`Deployment`, `Service`, `PDB`, `Namespace`, `LimitRange`, `ResourceQuota`) is `Synced`+`Healthy`. Cosmetic; not actionable.
    - `Deployment/logos-ui` → `2/2` ready, image `ghcr.io/oravandres/logosui/logos-ui:db27061`, pods spread across `pi-n1`/`pi-n2` per the `topologySpreadConstraints`.
    - `Certificate/logos-ui-tls` → `Ready=True`, signed by `mimi-internal-ca`, separate from `logos-tls` as called out in §4.4.
    - `GET /` → `200`, SPA shell, `cache-control: no-store`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`.
    - `GET /api/v1/health` → `200 {"status":"healthy"}` — Traefik continues to route `/api/v1` to `logos-api` ahead of the UI's `/` rule, confirming the sibling-Ingress design from §4.4 works as intended.
    - `GET /quotes` (deep link) → `200`, SPA fallback, `cache-control: no-store`.
    - `GET /assets/index-*.js` → `200`, `cache-control: public, max-age=31536000, immutable` (single line — the §4.1 nginx repeat-headers fix held up).
    - `GET /assets/missing.js` → `404` (no fallthrough to the HTML shell — the invariant the CI smoke test guards is preserved end-to-end).
5. Version bumps afterwards are single-line image tag changes in MiMi, driven by GHCR builds from this repo.

---

## 5. Configuration

| Variable | Build-time? | Default | Description |
|----------|-------------|---------|-------------|
| `VITE_LOGOS_API_BASE_URL` | yes (Vite) | `http://localhost:8000` in dev only | API base URL baked into the bundle. Prod builds fail if unset. For the cluster, set to `https://logos.mimi.local`. |

There are no runtime env vars — the container has nothing to configure at launch, only the nginx config that ships inside the image. If we ever need runtime API retargeting we can switch to a `/config.json` fetched on boot, but that's a deliberate step, not a default.

---

## 6. Non-goals (explicit)

- **Authentication** — the cluster is on an internal network; adding auth is a separate coordinated effort on both API and UI.
- **SSR** — this is a small admin UI; client-side rendering is simpler and sufficient.
- **Micro-frontends / module federation** — single bundle, single team, no justification.
- **Runtime API base URL** — build-time is simpler and the bundle is small enough to rebuild on retarget.

---

## 7. Open Questions

- **Canary or direct rollouts?** v1 plan is a simple `RollingUpdate` Deployment with 2 replicas; revisit if rollback pain warrants Argo Rollouts.
- **index.html caching via Traefik vs nginx?** Currently proposed in nginx (`Cache-Control: no-store`). If Traefik's middleware is the convention elsewhere in MiMi, move it there.
- **Single Argo CD Application for both `logos` and `logos-ui` vs two?** Two is cleaner (separate sync waves, separate health), mirrors the existing `logos-app.yaml`.
- ~~**Ingress ownership.** Two options: (a) extend `manifests/logos/ingress.yaml` to carry both path rules, or (b) give `logos-ui` its own Ingress resource on the same host.~~ Resolved as (b) in §4.4.
