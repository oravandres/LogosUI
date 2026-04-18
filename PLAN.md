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
| Tests | Vitest + RTL, 77 tests across 9 suites (all passing at time of writing) |
| Lint / typecheck | ESLint, `tsc --noEmit` clean |
| Cursor rules | Picker reachability, combobox a11y, sub-resource editor lessons captured in `.cursor/rules/` |

What is **not** shipped:

- The MiMi-side `manifests/logos-ui/`, the shared ingress, the Kyverno-policy namespace extension, and the Argo CD `Application` are drafted on the MiMi branch `feat/logos-ui-deployment` (Sections 4.3–4.6 below) and pinned to image tag `db27061` (the first GHCR build off `main` after the dockerization PR merged). PR pending review.
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

### Phase B.1 — Filtered-list deep links and inline edit on the detail page _(small, deferred)_

Split out of Phase B because each requires plumbing that does not yet exist:

- **"Open list with this author/tag"** links from the detail page need URL-search-param syncing in `QuotesPage` (currently filters live in component state only). `?tag=` also needs a backend filter on `GET /quotes` that the API does not expose today; coordinate with Logos before shipping.
- **Inline Edit on the detail page** would duplicate the QuotesPage create/edit form. Worth doing once the form is itself extracted into a shared `<QuoteForm>` component; for now the detail page links to `/quotes` for editing.

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

### Phase D — Observability _(small)_

- Structured `console.error` or a tiny logger that includes request path + status for every `ApiError` caught in mutations. No third-party RUM for now.
- Optional `X-Request-Id` header propagation if the backend starts emitting one (coordinate with Logos first).

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

### ~~4.3 MiMi manifests — new `logos-ui` namespace~~ _(in flight)_

Drafted on MiMi branch `feat/logos-ui-deployment`. A separate namespace (not a shared `logos`) keeps the failure domain clean and means the UI's quota doesn't squeeze the API. The namespace inherits the same baseline controls as every other namespace in the cluster (Namespace with `pod-security.kubernetes.io/enforce: restricted`, ResourceQuota, LimitRange — see `rules/12-pr-review-lessons.mdc`) and is added to all five existing Kyverno `ClusterPolicy` namespace selectors so the cluster's safety gates apply uniformly.

| File | Purpose |
|------|---------|
| `namespace.yaml` | Namespace `logos-ui` with `part-of: logos` and the restricted PSS label |
| `resourcequota.yaml` | Tight quota (500m CPU / 256Mi memory requests, 1 CPU / 512Mi limits, 5 pods) — UI is stateless static content |
| `limitrange.yaml` | Container defaults sized for nginx static serving (25m/32Mi req, 50m/64Mi default limits) |
| `deployment.yaml` | 2 replicas, image pinned to `ghcr.io/oravandres/logosui/logos-ui:db27061`, `imagePullPolicy: IfNotPresent`, RollingUpdate `maxUnavailable: 0` `maxSurge: 1`, restricted pod-level `securityContext` (`runAsNonRoot`, `runAsUser: 101`, seccomp `RuntimeDefault`), container-level `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`, three emptyDir tmpfs mounts for nginx scratch space (`/var/cache/nginx`, `/var/run`, `/tmp`), startup + readiness probes on `GET / :8080` (no liveness — nginx static has no recoverable failure mode that a restart would fix), and `topologySpreadConstraints` on `kubernetes.io/hostname` so the two replicas land on different nodes when possible |
| `service.yaml` | ClusterIP `logos-ui` on port 80 → targetPort 8080 |
| `pdb.yaml` | PodDisruptionBudget with `minAvailable: 1` so voluntary disruptions don't drop the UI |

No Secrets / SealedSecrets needed — static bundles carry no secrets (rule in `AGENTS.md`).

### ~~4.4 Ingress — sibling Ingress on the shared host~~ _(in flight)_

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

### 4.5 CORS — shrink to dev-only

Because production is same-origin, the API's `CORS_ALLOWED_ORIGINS` env var only needs to cover local dev origins (`http://localhost:5173,http://127.0.0.1:5173`). No change needed — that's what it already is. Document this explicitly in the UI README so no one widens it casually.

### ~~4.6 Argo CD Application~~ _(in flight)_

`manifests/argocd-apps/logos-ui-app.yaml` mirrors `logos-app.yaml`:

- `spec.source.path: manifests/logos-ui`
- `spec.destination.namespace: logos-ui`
- `sync-wave: "5"` (after `logos-app` at `"4"`; the UI does not require the API to be ready at boot — it talks to the API at request time — but ordering keeps a fresh-cluster bootstrap predictable).
- `syncPolicy.automated` + `selfHeal` + `CreateNamespace=true`.
- The Kyverno-policies app (`kyverno-policies`, sync-wave `0`) syncs first, so the namespace-selector extension is in place before the `logos-ui` workload pods are admitted.

### 4.7 Rollout sequence

1. ~~Merge this plan doc + scaffolding PR.~~ _(shipped: Phases A–C, plan doc on `main`.)_
2. ~~PR: add `Dockerfile`, `deploy/nginx.conf`, `.github/workflows/ci.yml`. CI validates on every push; the first `main` push after merge publishes `ghcr.io/oravandres/logosui/logos-ui:<sha>`.~~ _(shipped, GHCR tag `db27061`.)_
3. ~~PR to MiMi: add `manifests/logos-ui/*` with `image: ghcr.io/oravandres/logosui/logos-ui:db27061` pinned to the SHA from step 2, add a sibling ingress in `manifests/logos-ui/`, add `manifests/argocd-apps/logos-ui-app.yaml`, and extend the five Kyverno `ClusterPolicy` namespace selectors to cover `logos-ui`.~~ _(in flight: MiMi branch `feat/logos-ui-deployment`; `yamllint` + `kubeconform` clean.)_
4. **Next:** verify in-cluster after MiMi PR merges and Argo CD syncs: `https://logos.mimi.local/` loads the SPA; `https://logos.mimi.local/api/v1/health` still returns `{"status":"healthy"}`; deep links (`/quotes`, `/authors/...`) resolve via the SPA fallback.
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
