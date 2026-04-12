/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the Logos API (e.g. http://localhost:8000). No trailing slash. CORS must allow this UI origin. */
  readonly VITE_LOGOS_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
