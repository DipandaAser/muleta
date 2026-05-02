import type { Highlighter } from "shiki"

/**
 * Languages bundled with the dashboard's Shiki highlighter. Adding to this
 * list grows the chunk by ~10–30 KB per grammar — not bundled into the
 * initial page weight because `getHighlighter()` is dynamic-imported.
 */
export const SUPPORTED_LANGS = [
  "ts",
  "js",
  "tsx",
  "jsx",
  "json",
  "bash",
  "sh",
  "yaml",
  "diff",
  "html",
  "css",
] as const

export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

/**
 * Themes mapped to muleta's daisyUI theme ids. Picking the GitHub themes
 * because they're well-tuned for both light and dark and use a colour
 * palette that doesn't clash with the muleta accent. Swappable later if
 * we hand-roll a theme.
 */
export const THEME_FOR = {
  "muleta-dark": "github-dark",
  "muleta-light": "github-light",
} as const

let instance: Promise<Highlighter> | null = null

/**
 * Lazy singleton. Shiki's WASM + grammar load is real (~150 KB gzipped),
 * but routes that don't render `<Code>` never trigger the dynamic import.
 * Resolved highlighter is cached for the lifetime of the SPA.
 */
export function getHighlighter(): Promise<Highlighter> {
  if (!instance) {
    instance = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: [...SUPPORTED_LANGS],
      }),
    )
  }
  return instance
}
