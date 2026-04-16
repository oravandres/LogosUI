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
| Tests | Vitest + RTL, 39 tests across 6 suites (all passing at time of writing) |
| Lint / typecheck | ESLint, `tsc --noEmit` clean |
| Cursor rules | Picker reachability, combobox a11y, sub-resource editor lessons captured in `.cursor/rules/` |

What is **not** shipped:

- No production deployment — no Dockerfile, no CI, no cluster manifests.
- No route for a single quote detail view (all navigation lands on the list pages).
- No global search, no dark mode, no skeleton loaders.
- `AuthorPicker` keyboard contract is still inlined; it should be a shared primitive once a second picker needs it.

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

### Phase A — Combobox primitive refactor _(small, low risk)_

Lift the keyboard contract currently inlined in `AuthorPicker` into a shared `<Combobox>` primitive. Future pickers (tag selection in create forms, category filters on mobile, etc.) will reuse it. The contract is already documented in `.cursor/rules/12-pr-review-lessons.mdc`.

- Introduce `src/components/Combobox.tsx` implementing the contract (arrow/Home/End/Enter/Escape, `aria-activedescendant`, `onMouseDown` preventDefault, auto-scroll, active/selected styles).
- Rewrite `AuthorPicker` in terms of it without changing its public API.
- Unit tests for the primitive directly (not only through `AuthorPicker`).

### Phase B — Quote detail view _(medium)_

A dedicated read-oriented page at `/quotes/:id` rendering:

- Title, full text, author (with bio snippet + portrait from `image_id`), image if present, category chip, tag chips.
- Edit / delete actions gated behind a confirm.
- "Open in list with this author" and "…with this tag" links that navigate to the filtered list pages.

Touches: new route, new page, a small `<QuoteView>` component, and a `Link` from the home "recent quotes" list and from the quotes table to `/quotes/:id`.

### Phase C — Global polish _(medium)_

- **Skeleton loaders** on list pages and the home dashboard instead of "Loading…" strings.
- **Empty-state CTAs** on every list page ("No quotes yet — create one"), not only on the home page.
- **Toasts or inline banners** for successful create/update/delete mutations (replace silent success).
- **Dark mode** via `prefers-color-scheme` with a CSS custom property palette (no runtime toggle in v1).
- **Error boundary** at the router level so a thrown render error shows a friendly fallback.

### Phase D — Observability _(small)_

- Structured `console.error` or a tiny logger that includes request path + status for every `ApiError` caught in mutations. No third-party RUM for now.
- Optional `X-Request-Id` header propagation if the backend starts emitting one (coordinate with Logos first).

### Phase E — Stretch _(future)_

- Bulk operations (multi-select rows → bulk delete / bulk add tag).
- CSV export from list pages.
- Keyboard shortcuts for power users (`/` to focus search, `n` to create).
- Full-text search once the backend exposes it.

**Rough ordering:** A → B → C → D, then E as user feedback dictates. A and B are independently shippable and do not conflict.

---

## 4. Deployment to the MiMi Cluster _(the missing piece)_

Right now the backend lives at `https://logos.mimi.local/api/v1`. The UI is not deployed at all. The plan is to co-host the UI on the **same host** as the API so the browser treats API calls as same-origin — which eliminates the CORS surface in production entirely.

### 4.1 Containerization

Add a `Dockerfile` to this repo (similar shape to `Logos/Dockerfile`):

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_LOGOS_API_BASE_URL=https://logos.mimi.local
ENV VITE_LOGOS_API_BASE_URL=${VITE_LOGOS_API_BASE_URL}
RUN npm run build

# Runtime stage — unprivileged nginx serving the static bundle
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=builder /src/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
```

Key points:

- Use `nginxinc/nginx-unprivileged` so the container runs as non-root out of the box — compatible with the `logos-ui` namespace's `pod-security.kubernetes.io/enforce: restricted` label.
- Bake `VITE_LOGOS_API_BASE_URL=https://logos.mimi.local` at build time so the bundle points at the same host it's served from. (Vite already fails the build if the env is missing.)
- Ship an `nginx.conf` with two rules:
  1. Hashed asset files (`/assets/*`) → `Cache-Control: public, max-age=31536000, immutable`.
  2. `index.html` and the SPA fallback (`try_files $uri /index.html`) → `Cache-Control: no-store` so users never get stranded on a stale chunk graph after a deploy (this is in `AGENTS.md`).

### 4.2 GitHub Actions — multi-arch build + GHCR push

Add `.github/workflows/docker.yml` mirroring the Logos pattern:

- Triggers: `push` to `main`.
- `setup-qemu-action` + `setup-buildx-action`.
- Login to `ghcr.io` with `secrets.GITHUB_TOKEN` and `packages: write` permission.
- Tag with short git SHA via `docker/metadata-action`.
- `platforms: linux/amd64,linux/arm64` — the MiMi cluster mixes Raspberry Pi arm64 with amd64 nodes, so a single-platform tag will fail rollouts (see `rules/12-pr-review-lessons.mdc`).
- Image repo: `ghcr.io/oravandres/logosui/logos-ui`.

Also add a lightweight `.github/workflows/ci.yml`:

- `npm ci`, `npm run lint`, `tsc --noEmit` (both app and node configs), `npm test`.
- `npm run build` with `VITE_LOGOS_API_BASE_URL` set to a placeholder so the build gate catches type / import regressions.

### 4.3 MiMi manifests — new `logos-ui` namespace

Create `manifests/logos-ui/` in the MiMi repo. A separate namespace (not a shared `logos`) keeps the failure domain clean and means the UI's quota doesn't squeeze the API. Must inherit the same baseline controls as every other namespace in the cluster (Namespace with `pod-security.kubernetes.io/enforce: restricted`, ResourceQuota, LimitRange — see `rules/12-pr-review-lessons.mdc`).

| File | Purpose |
|------|---------|
| `namespace.yaml` | Namespace `logos-ui` with `part-of: logos` and the restricted PSS label |
| `resourcequota.yaml` | Small quota (e.g. 500m CPU / 512Mi memory / 5 pods) — UI is stateless static content |
| `limitrange.yaml` | Defaults matching the rest of the cluster |
| `deployment.yaml` | 2 replicas, immutable SHA-tagged image, `imagePullPolicy: IfNotPresent`, restricted `securityContext` (nonRoot, seccomp RuntimeDefault, drop ALL caps, no privilege escalation), readiness probe on `GET /` port 8080 |
| `service.yaml` | ClusterIP `logos-ui` on port 80 → targetPort 8080 |
| `pdb.yaml` | PodDisruptionBudget with `minAvailable: 1` so voluntary disruptions don't drop the UI |

No Secrets / SealedSecrets needed — static bundles carry no secrets (rule in `AGENTS.md`).

### 4.4 Ingress — extend the existing Logos ingress

Amend `manifests/logos/ingress.yaml` (or add a sibling `manifests/logos-ui/ingress.yaml` on the same host) to add a path rule:

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

### 4.6 Argo CD Application

Add `manifests/argocd-apps/logos-ui-app.yaml` mirroring `logos-app.yaml`:

- `spec.source.path: manifests/logos-ui`
- `spec.destination.namespace: logos-ui`
- `sync-wave: "5"` (after `logos-app` at `"4"`; the UI depends on the API being deployable but not strictly running).
- `syncPolicy.automated` + `selfHeal` + `CreateNamespace=true`.

### 4.7 Rollout sequence

1. Merge this plan doc + scaffolding PR.
2. PR: add `Dockerfile`, `deploy/nginx.conf`, `.github/workflows/{ci,docker}.yml`. CI validates on every push; the first `main` push after merge publishes `ghcr.io/oravandres/logosui/logos-ui:<sha>`.
3. PR to MiMi: add `manifests/logos-ui/*` with `image: ghcr.io/oravandres/logosui/logos-ui:<sha>` pinned to the just-built SHA. Extend `manifests/logos/ingress.yaml`. Add `manifests/argocd-apps/logos-ui-app.yaml`.
4. Verify: `https://logos.mimi.local/` loads the SPA; `https://logos.mimi.local/api/v1/health` still returns `{"status":"healthy"}`; deep links (`/quotes`, `/authors/...`) resolve via the SPA fallback.
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
- **Ingress ownership.** Two options: (a) extend `manifests/logos/ingress.yaml` to carry both path rules, or (b) give `logos-ui` its own Ingress resource on the same host. (b) is cleaner for GitOps diffs and matches "each namespace owns its own manifests"; (a) is simpler. Default to (b) unless Traefik complains about duplicate-host ingresses.
