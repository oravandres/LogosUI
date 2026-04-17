import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guard the palette contract that powers dark mode. Every component rule in
// `index.css` reads colors via `var(--token)`, so these invariants are what
// actually prevent a palette change from shipping a half-migrated theme:
//   1. `:root` declares `color-scheme: light dark` so UA form controls,
//      scrollbars, and canvas follow the user's preference.
//   2. The dark override declares the EXACT same set of tokens as the light
//      defaults. CSS custom properties inherit, so any token present only in
//      light would silently bleed its light value into dark mode.
//   3. A small allowlist of semantic-anchor tokens MUST have different
//      values in light vs. dark (page background, panel background, primary
//      text, header, skeleton base) — otherwise "dark mode" is just a label
//      that paints the same surfaces.
//   4. No component rule carries a literal color value. Every color —
//      whether hex, rgb/rgba/hsl/hsla/hwb/lab/lch/oklab/oklch/color/
//      color-mix, or a bare CSS named color — must flow through
//      `var(--token)`. Only the two palette declarations hold raw values.

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, "../index.css");
const css = readFileSync(cssPath, "utf8");

function extractLightPaletteBody(source: string): string {
  // First `:root { ... }` in the file is the light defaults. Custom-property
  // blocks never contain `}` themselves, so a non-greedy [^}] class is safe.
  const m = source.match(/:root\s*\{([^}]*)\}/);
  if (!m) throw new Error("light :root block not found");
  return m[1];
}

function extractDarkPaletteBody(source: string): string {
  const m = source.match(
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}\s*\}/
  );
  if (!m) throw new Error("dark @media :root block not found");
  return m[1];
}

function parseDeclarations(body: string): Map<string, string> {
  // Collect every `--token: value;` declaration from a palette body, keyed
  // by token name with whitespace-trimmed values for later comparison.
  const out = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.set(m[1], m[2].trim().replace(/\s+/g, " "));
  }
  return out;
}

function stripPalettes(source: string): string {
  // Remove the two palette declarations so the remaining text represents
  // component rules only. This is the surface we enforce "colors flow
  // through var(--token)" on.
  const withoutLight = source.replace(/:root\s*\{[^}]*\}/, "");
  return withoutLight.replace(
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/,
    ""
  );
}

function extractDeclarationValues(source: string): string[] {
  // Crude but sufficient: for every `property: value;` declaration, return
  // the value. We intentionally skip `{` and `}` so at-rule preludes (e.g.
  // `@media (prefers-reduced-motion: reduce) {`) are ignored — they're not
  // property declarations.
  const values: string[] = [];
  const re = /(?:^|[;{}\s])([a-z-][a-z0-9-]*)\s*:\s*([^;{}]+)(?=;|\})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    values.push(m[2]);
  }
  return values;
}

describe("index.css palette contract", () => {
  it("declares color-scheme: light dark on :root", () => {
    const light = extractLightPaletteBody(css);
    expect(light).toMatch(/color-scheme:\s*light\s+dark/);
  });

  it("dark override redefines every light-palette token (key sets match exactly)", () => {
    const lightDecls = parseDeclarations(extractLightPaletteBody(css));
    const darkDecls = parseDeclarations(extractDarkPaletteBody(css));

    // Every --token in light must also appear in dark. If any light token is
    // missing from dark, CSS inheritance would silently paint that surface
    // with the light value even under `prefers-color-scheme: dark`.
    const missingInDark = [...lightDecls.keys()].filter(
      (k) => !darkDecls.has(k)
    );
    expect(missingInDark).toEqual([]);

    // The reverse must also hold: a token that only exists in dark cannot
    // fall back anywhere when the user prefers light, which would leave
    // `var(--foo)` unresolved and degrade to the property's initial value.
    const extraInDark = [...darkDecls.keys()].filter(
      (k) => !lightDecls.has(k)
    );
    expect(extraInDark).toEqual([]);
  });

  it("semantic-anchor tokens have different values in light vs. dark", () => {
    const lightDecls = parseDeclarations(extractLightPaletteBody(css));
    const darkDecls = parseDeclarations(extractDarkPaletteBody(css));

    // These are the tokens where "light and dark carry the same value" is
    // almost certainly a bug — if `--bg-page` or `--text-primary` does not
    // change, dark mode is not actually dark. This list is intentionally
    // short; tokens whose value may legitimately match across themes
    // (e.g. `--accent` acting as a focus ring that reads on both palettes)
    // stay out of this set.
    const mustDiffer = [
      "--bg-page",
      "--bg-panel",
      "--bg-header",
      "--bg-code",
      "--border-subtle",
      "--text-primary",
      "--text-body",
      "--text-muted",
      "--input-bg",
      "--input-text",
      "--skeleton-base",
      "--skeleton-highlight",
    ];
    for (const token of mustDiffer) {
      const lightVal = lightDecls.get(token);
      const darkVal = darkDecls.get(token);
      expect(lightVal, `${token} missing from light palette`).toBeDefined();
      expect(darkVal, `${token} missing from dark palette`).toBeDefined();
      expect(
        darkVal,
        `${token} has the same value in light and dark (${lightVal})`
      ).not.toBe(lightVal);
    }
  });

  it("component rules use only var(--token) for colors, no literal values", () => {
    // Component-rule surface = everything outside the two palette blocks.
    // Inside this surface, NO value may carry a raw color literal — be it
    // hex, an rgb()/hsl()/color() family function, or a bare CSS named
    // color. Allowed keywords (e.g. `transparent`, `currentcolor`, `none`,
    // `inherit`, `initial`, `unset`, `auto`) stay permitted.
    const componentSurface = stripPalettes(css);
    const values = extractDeclarationValues(componentSurface);

    // Regexes are compiled once per run (module-level constants would hurt
    // readability for no gain — this file runs in milliseconds either way).
    const colorFunctionNames = [
      "rgb",
      "rgba",
      "hsl",
      "hsla",
      "hwb",
      "lab",
      "lch",
      "oklab",
      "oklch",
      "color",
      "color-mix",
    ];
    const colorFunctionRe = new RegExp(
      `\\b(${colorFunctionNames.join("|")})\\s*\\(`,
      "i"
    );
    const hexRe = /#[0-9a-fA-F]{3,8}\b/;

    // CSS named colors human authors actually reach for. The full list is
    // 148 names; we keep a practical subset. Values are scanned as free
    // tokens so sub-string matches inside `var(--name)` or other
    // identifiers are not a concern (we check declaration *values*, not
    // selectors or property names).
    const namedColors = [
      "red",
      "green",
      "blue",
      "yellow",
      "orange",
      "purple",
      "pink",
      "cyan",
      "magenta",
      "black",
      "white",
      "gray",
      "grey",
      "brown",
      "silver",
      "gold",
      "navy",
      "teal",
      "maroon",
      "olive",
      "lime",
      "aqua",
      "fuchsia",
      "indigo",
      "violet",
      "coral",
      "crimson",
      "salmon",
      "turquoise",
      "khaki",
      "plum",
      "orchid",
      "chocolate",
      "tomato",
    ];
    const namedColorRe = new RegExp(`\\b(${namedColors.join("|")})\\b`, "i");

    const offending: Array<{ value: string; reason: string }> = [];
    for (const rawValue of values) {
      // Strip var(...) wrappers before scanning so a token reference like
      // `var(--error-bg, red)` would still flag `red` but `var(--red-herring)`
      // (not present in our palette, but defensive) would not — token *names*
      // are not color literals.
      const scan = rawValue.replace(/var\(\s*--[a-z0-9-]+\s*\)/gi, "");
      if (hexRe.test(scan)) {
        offending.push({ value: rawValue.trim(), reason: "hex literal" });
        continue;
      }
      const fn = scan.match(colorFunctionRe);
      if (fn) {
        offending.push({
          value: rawValue.trim(),
          reason: `${fn[1].toLowerCase()}() color function`,
        });
        continue;
      }
      const named = scan.match(namedColorRe);
      if (named) {
        offending.push({
          value: rawValue.trim(),
          reason: `named color "${named[1].toLowerCase()}"`,
        });
      }
    }

    expect(offending).toEqual([]);
  });
});
