import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals are disabled in this project, so React Testing Library's
// automatic cleanup (normally wired to `afterEach`) is not registered.
// Register it once here so every test file unmounts rendered components
// between cases and queries do not see stale DOM from previous tests.
afterEach(() => {
  cleanup();
});
