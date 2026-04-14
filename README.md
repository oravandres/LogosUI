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
