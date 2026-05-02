import type { ThemeRegistration } from "shiki"

/**
 * Shiki themes that mirror muleta's daisyUI palette. Each scope maps to a
 * semantic muleta colour token rather than a hand-picked hex, so swapping
 * theme tokens (e.g. tweaking `--color-success`) cascades naturally — but
 * Shiki resolves themes to plain hex at highlight time, so we can't
 * actually `var(--color-success)` here. Instead, the hex values below
 * mirror the daisyUI tokens defined in `theme.css`. Keep them in sync.
 *
 * Token-scope choices follow the design (the first JSON screenshot the
 * user shared): string values pop in green, numbers/booleans in blue,
 * keys keep the default foreground, punctuation fades to muted. Keeps
 * dense JSON readable without rainbow-syndrome.
 */

// ─── muleta-dark hex values (mirror packages/ui/src/theme.css :muleta-dark) ──
const DARK = {
  fg: "#ededef", // --color-base-content
  fgMuted: "#8b8b92", // text tier "fg-3"
  fgVeryMuted: "#5c5c64", // text tier "fg-4"
  string: "#3ecf8e", // --color-success
  number: "#6ea9ff", // --color-info
  boolean: "#9c8de0", // --color-state-paused (violet) — booleans/null
  key: "#dc4827", // muleta primary red brightened for dark surfaces
  keyword: "#d8a74a", // --color-warning
  fn: "#9c8de0", // shares the boolean violet — same conceptual "language" tone
  type: "#a8b2c4", // --color-state-waiting (cool blue-grey)
  regex: "#ff6b7a", // --color-error
  // Concrete bg — Monaco's renderer doesn't handle the `#00000000` transparent
  // value the way Shiki does. The `<Code>` component still overrides via CSS,
  // so this only matters when Monaco consumes the theme.
  bg: "#0a0a0b", // --color-base-100 (dark)
}

// ─── muleta-light hex values (mirror :muleta-light) ────────────────────────
const LIGHT = {
  fg: "#1a1a1c",
  fgMuted: "#5c5c64",
  fgVeryMuted: "#8b8b92",
  string: "#0f7a4a",
  number: "#1e5fc4",
  boolean: "#5a3fb0", // --color-state-paused light variant
  key: "#a83a1f", // muleta primary red darkened for white surfaces
  keyword: "#8a6614",
  fn: "#5a3fb0",
  type: "#4a5568",
  regex: "#b6202f",
  bg: "#fafaf8", // --color-base-100 (light)
}

/**
 * Builds a Shiki theme registration from the muleta-coloured palette.
 * Same scope list for light and dark — only the hex values differ.
 *
 * Scope choices are deliberately broad. Shiki's tokenizer emits scopes
 * in increasing specificity (`punctuation.definition.string.json` etc.)
 * and walks them outside-in, so a coarse `string` rule still applies to
 * the most-specific JSON string scope unless something more specific
 * overrides it. Lets us write a small, maintainable theme.
 */
function build(name: string, type: "dark" | "light", c: typeof DARK): ThemeRegistration {
  return {
    name,
    type,
    semanticHighlighting: false,
    colors: {
      "editor.background": c.bg,
      "editor.foreground": c.fg,
    },
    fg: c.fg,
    bg: c.bg,
    tokenColors: [
      // Default — falls through when no scope matches.
      {
        settings: { foreground: c.fg },
      },
      // Comments — most muted.
      {
        scope: ["comment", "punctuation.definition.comment"],
        settings: { foreground: c.fgVeryMuted, fontStyle: "italic" },
      },
      // Punctuation — braces, commas, colons. One step less muted than comments.
      {
        scope: [
          "punctuation",
          "punctuation.separator",
          "punctuation.terminator",
          "punctuation.section",
          "meta.brace",
          "meta.delimiter",
        ],
        settings: { foreground: c.fgMuted },
      },
      // Strings — the headliner colour. Includes JSON values, JS literals,
      // template-string spans, regex bodies share `string.regexp`.
      {
        scope: ["string", "string.quoted", "string.template", "meta.string"],
        settings: { foreground: c.string },
      },
      // String escape sequences (\n, \uXXXX) — borrow the number colour to
      // pop them out of the surrounding string.
      {
        scope: ["constant.character.escape", "constant.other.placeholder"],
        settings: { foreground: c.number },
      },
      // Regex — distinct error tint so they don't blend into strings.
      {
        scope: ["string.regexp"],
        settings: { foreground: c.regex },
      },
      // Numbers — blue. Kept separate from booleans / null so each value
      // type reads as a distinct shape in dense JSON.
      {
        scope: ["constant.numeric"],
        settings: { foreground: c.number },
      },
      // Booleans, null, undefined — violet. Same conceptual bucket
      // ("language constants"), distinct from numeric values.
      {
        scope: [
          "constant.language",
          "constant.language.boolean",
          "constant.language.boolean.true",
          "constant.language.boolean.false",
          "constant.language.boolean.true.json",
          "constant.language.boolean.false.json",
          "constant.language.null",
          "constant.language.null.json",
          "constant.language.undefined",
          "constant.language.nan",
          "constant.language.infinity",
        ],
        settings: { foreground: c.boolean },
      },
      // Keywords — `const`, `await`, `return`, `if`, etc.
      {
        scope: [
          "keyword",
          "keyword.control",
          "keyword.operator.new",
          "keyword.operator.expression",
          "storage.type",
          "storage.modifier",
        ],
        settings: { foreground: c.keyword },
      },
      // Plain operators (=, +, ===) — muted so they don't compete.
      {
        scope: ["keyword.operator", "keyword.operator.assignment", "keyword.operator.arithmetic"],
        settings: { foreground: c.fgMuted },
      },
      // Functions — both definitions and calls.
      {
        scope: [
          "entity.name.function",
          "support.function",
          "meta.function-call",
          "meta.function-call entity.name.function",
          "variable.function",
        ],
        settings: { foreground: c.fn },
      },
      // Types & classes — `Promise`, `Array`, user-defined classes.
      {
        scope: [
          "entity.name.type",
          "entity.name.class",
          "support.type",
          "support.class",
          "storage.type.class",
        ],
        settings: { foreground: c.type },
      },
      // JSON keys — muleta red. Listed near the bottom of `tokenColors`
      // so it wins over the broader `string` rule above for tokens that
      // carry both `string.quoted.double.json` AND
      // `support.type.property-name.json` scopes (the way every common
      // JSON tmGrammar exposes a key's content).
      //
      // Important: do NOT add `meta.structure.dictionary.json string.*`
      // here — that would match every string ever, since both keys AND
      // values live inside `meta.structure.dictionary.json`. Only
      // KEY-specific scopes go in this list.
      {
        scope: [
          "support.type.property-name",
          "support.type.property-name.json",
          "support.type.property-name.json.comments",
          "meta.object-literal.key",
          "meta.object.member",
          "meta.structure.dictionary.key",
          "meta.structure.dictionary.key.json",
          "variable.other.object.property",
        ],
        settings: { foreground: c.key },
      },
      // Generic variables — default foreground.
      {
        scope: ["variable", "variable.other", "variable.parameter"],
        settings: { foreground: c.fg },
      },
    ],
  }
}

export const muletaDark: ThemeRegistration = build("muleta-dark", "dark", DARK)
export const muletaLight: ThemeRegistration = build("muleta-light", "light", LIGHT)
