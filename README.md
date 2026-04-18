# LogosUI

TypeScript + React (Vite) client for the [Logos](https://github.com/oravandres/Logos) HTTP API.

## Setup

```bash
npm install
```

Optional: copy `.env.example` to `.env.development` (gitignored) and set `VITE_LOGOS_API_BASE_URL` if Logos is not on `http://localhost:8000`. In development, that URL is the default when the variable is unset.

To point the dev server at the API behind cluster ingress (MiMi), use the public API URL, for example:

```bash
# .env.development
VITE_LOGOS_API_BASE_URL=https://logos.mimi.local
```

Logos must allow your UI origin with `CORS_ALLOWED_ORIGINS` (for local Vite that is typically `http://localhost:5173`).

```bash
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## Production build

`npm run build` requires `VITE_LOGOS_API_BASE_URL` to be set (for example in `.env.production`, which is gitignored, or in CI). The Vite config fails the build early if it is missing.

## Logos API and CORS

The browser loads the UI from the Vite origin and calls the Logos API on a **different origin**. **Logos must send CORS headers** that allow your UI origin (`CORS_ALLOWED_ORIGINS` on the Logos service; see the Logos and MiMi manifests).

## Scripts

| Script        | Description        |
| ------------- | ------------------ |
| `npm run dev` | Vite dev server    |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Serve production build locally |
| `npm run lint` | ESLint             |
| `npm test`    | Vitest (run once)  |

## Container image

The repo ships a multi-stage `Dockerfile` (Node 22 builder → unprivileged nginx runtime) and a matching `deploy/nginx.conf`. The runtime container listens on port `8080` as the non-root nginx user (UID 101), so it is compatible with a `pod-security.kubernetes.io/enforce: restricted` namespace.

```bash
docker build \
  --build-arg VITE_LOGOS_API_BASE_URL=https://logos.mimi.local \
  -t logos-ui:dev .
docker run --rm -p 8080:8080 logos-ui:dev
# open http://localhost:8080
```

The `VITE_LOGOS_API_BASE_URL` build-arg is baked into the JS bundle (Vite env vars are public), so each environment that targets a different API URL needs its own image build. CI publishes a multi-arch image (`linux/amd64`, `linux/arm64`) tagged with the short git SHA on every push to `main`:

```
ghcr.io/oravandres/logosui/logos-ui:<short-sha>
```

`nginx.conf` caches `/assets/*` (Vite's content-hashed bundle) for one year as `immutable` and serves `index.html` with `Cache-Control: no-store` so users never get stranded on a stale shell that references removed chunks after a deploy.

## Deployment

The cluster manifests for the `logos-ui` namespace and the shared ingress with `logos-api` live in the [MiMi](https://github.com/oravandres/MiMi) repo. In production the UI and the API share an origin (`https://logos.mimi.local`), so the browser never issues a CORS preflight; `CORS_ALLOWED_ORIGINS` on the API only covers local dev (typically `http://localhost:5173`). Do not widen it to bake the prod origin in — that would silently re-introduce a same-origin assumption violation.

## CI

GitHub Actions runs a single `.github/workflows/ci.yml` on every PR and push to `main`, with two jobs:

- **`test-and-build`** — `npm ci`, `npm run lint`, `npm test`, `npm run build` (which is `tsc -b && vite build`, so it also typechecks both tsconfig projects).
- **`container`** (`needs: test-and-build`) — builds the image for `linux/amd64` with `--load` and runs a smoke test against the running container (non-root UID 101, cache headers on `index.html` and hashed assets, SPA deep-link fallback, `/assets/missing.js` returning 404). On `push: main` only, the same job then builds multi-arch (`linux/amd64,linux/arm64`) and pushes to `ghcr.io/oravandres/logosui/logos-ui:<short-sha>`. The publish step is unreachable unless `test-and-build` and the smoke test pass on the same commit.
