import type { Highlighter } from "shiki"
import { muletaDark, muletaLight } from "./themes"

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
 * Maps daisyUI theme ids to the matching Shiki theme name. Both the
 * dark and light variants are hand-rolled in `./themes.ts` against
 * muleta's daisyUI palette, so syntax-highlighted output sits alongside
 * the dashboard's surface and accent colours without a palette break.
 */
export const THEME_FOR = {
  "muleta-dark": "muleta-dark",
  "muleta-light": "muleta-light",
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
        themes: [muletaDark, muletaLight],
        langs: [...SUPPORTED_LANGS],
      }),
    )
  }
  return instance
}
