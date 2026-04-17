import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guard the palette contract that powers dark mode. Every component rule in
// `index.css` reads colors via `var(--token)`, so these invariants are what
// actually prevent a palette change from shipping a half-migrated theme:
//   1. `:root` declares `color-scheme: light dark` so UA form controls,
//      scrollbars, and canvas follow the user's preference.
//   2. A `@media (prefers-color-scheme: dark)` block overrides the tokens.
//   3. No component rule carries a hard-coded hex (all hexes live in the two
//      palette declarations — light defaults and dark overrides).

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, "../index.css");
const css = readFileSync(cssPath, "utf8");

describe("index.css palette contract", () => {
  it("declares color-scheme: light dark on :root", () => {
    // The :root block must declare color-scheme so the browser chrome
    // (scrollbars, default form controls) matches the active palette.
    const rootBlock = css.match(/:root\s*\{[^}]*\}/);
    expect(rootBlock).not.toBeNull();
    expect(rootBlock![0]).toMatch(/color-scheme:\s*light\s+dark/);
  });

  it("declares a prefers-color-scheme: dark override with the same tokens", () => {
    const darkBlock = css.match(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?:root\s*\{([\s\S]*?)\}\s*\}/
    );
    expect(darkBlock).not.toBeNull();

    // Pick a handful of load-bearing tokens: if any of these is missing from
    // the dark override, a large swath of the UI stays light even under the
    // dark media query. Keeping the list small means "add a new token" does
    // not force a test churn — only the semantic anchors must stay covered.
    const required = [
      "--bg-page",
      "--bg-panel",
      "--bg-header",
      "--text-primary",
      "--text-body",
      "--text-muted",
      "--border-subtle",
      "--input-bg",
      "--input-text",
      "--btn-primary-bg",
      "--skeleton-base",
    ];
    for (const token of required) {
      expect(darkBlock![1]).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("does not use hard-coded hex colors outside the two palette declarations", () => {
    // Slice out both palette blocks (the light `:root` and the dark
    // media-query override) and verify the remainder of the stylesheet has
    // no `#rrggbb` literals. Everything else must go through var(--token).
    const withoutLightPalette = css.replace(/:root\s*\{[^}]*\}/, "");
    const withoutBothPalettes = withoutLightPalette.replace(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?:root\s*\{[\s\S]*?\}\s*\}/,
      ""
    );
    const strayHex = withoutBothPalettes.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(strayHex).toEqual([]);
  });
});
