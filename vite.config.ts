import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") {
    const env = loadEnv(mode, rootDir, "");
    const base = env.VITE_LOGOS_API_BASE_URL?.trim() ?? "";
    if (base === "") {
      throw new Error(
        "VITE_LOGOS_API_BASE_URL is required for production builds (set in .env.production or the environment)."
      );
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.join(rootDir, "src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
