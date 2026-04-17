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
//      whether hex, any rgb/rgba/hsl/hsla/hwb/lab/lch/oklab/oklch/color/
//      color-mix function, or any of the full CSS Color Module Level 4
//      named colors (including legacy aliases and `rebeccapurple`) —
//      must flow through `var(--token)`. The palette-safe keywords
//      `transparent` and `currentcolor` remain allowed. Only the two
//      palette declarations hold raw values.

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

    // Full CSS Color Module Level 4 named-color set (including CSS2 legacy
    // aliases like `grey`/`gray` and `darkgrey`/`darkgray`). A hand-picked
    // subset would let oddities like `rebeccapurple` or `aliceblue` slip
    // through the contract, so this list is exhaustive by design —
    // maintained as a single static array so adding a new CSS spec name
    // (the list has not grown since `rebeccapurple` in 2014) is a one-line
    // change, and `transparent` / `currentcolor` are deliberately omitted
    // since they are palette-safe keywords callers are allowed to use.
    const namedColors = [
      "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure",
      "beige", "bisque", "black", "blanchedalmond", "blue",
      "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
      "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson",
      "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
      "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
      "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
      "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
      "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey",
      "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia",
      "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green",
      "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo",
      "ivory", "khaki", "lavender", "lavenderblush", "lawngreen",
      "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
      "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
      "lightpink", "lightsalmon", "lightseagreen", "lightskyblue",
      "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow",
      "lime", "limegreen", "linen", "magenta", "maroon",
      "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
      "mediumseagreen", "mediumslateblue", "mediumspringgreen",
      "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
      "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive",
      "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
      "palegreen", "paleturquoise", "palevioletred", "papayawhip",
      "peachpuff", "peru", "pink", "plum", "powderblue", "purple",
      "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown",
      "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver",
      "skyblue", "slateblue", "slategray", "slategrey", "snow",
      "springgreen", "steelblue", "tan", "teal", "thistle", "tomato",
      "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
      "yellowgreen",
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
