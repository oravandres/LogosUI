# LogosUI

TypeScript + React (Vite) client for the [Logos](https://github.com/oravandres/Logos) HTTP API.

## Setup

```bash
npm install
```

Optional: copy `.env.example` to `.env.development` and set `VITE_LOGOS_API_BASE_URL` if Logos is not on `http://localhost:8000`. In development, that URL is the default when the variable is unset.

```bash
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## Logos API and CORS

The browser loads the UI from the Vite origin and calls the Logos API on a **different origin** (e.g. `http://localhost:8000`). **Logos must send CORS headers** that allow your UI origin (see your CORS work on the Logos repo).

## Scripts

| Script        | Description        |
| ------------- | ------------------ |
| `npm run dev` | Vite dev server    |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Serve production build locally |
| `npm run lint` | ESLint             |
