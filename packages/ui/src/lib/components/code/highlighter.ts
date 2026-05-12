import type { HighlighterCore } from "shiki/core"
import { muletaDark, muletaLight } from "./themes"

/**
 * Languages bundled with the dashboard's Shiki highlighter.
 *
 * Trimmed deliberately to the three we actually render:
 *   - `json` job data, options, return values, raw views
 *   - `bash` shell snippets in the docker-run / curl examples on
 *     embed-doc tabs and the job-page shell views
 *   - `ts`   `await queue.add(...)` preview in the add-job page
 *
 * Adding to this list grows the chunk by ~10–30 KB per grammar.
 * Anything not in this list falls back to plain text (no colour, no
 * crash). If a future view needs yaml/diff/etc., add the matching
 * `@shikijs/langs/<name>` import below and re-register it on the
 * Monaco bridge in `editor-loader.ts`.
 */
export const SUPPORTED_LANGS = ["json", "bash", "ts"] as const

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

let instance: Promise<HighlighterCore> | null = null

/**
 * Lazy singleton. Built on `shiki/core` + the JavaScript regex engine
 * (instead of the Oniguruma WASM engine) drops the ~50 KB WASM blob
 * and a layer of grammar machinery. JSON and bash both work cleanly
 * with the JS engine per Shiki's compatibility table.
 *
 * Grammars are imported one-by-one rather than via `shiki`'s bundled
 * entry, so the chunk only carries the two languages we use.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  if (!instance) {
    instance = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, json, bash, typescript] =
        await Promise.all([
          import("shiki/core"),
          import("shiki/engine/javascript"),
          import("@shikijs/langs/json"),
          import("@shikijs/langs/bash"),
          import("@shikijs/langs/typescript"),
        ])
      return createHighlighterCore({
        themes: [muletaDark, muletaLight],
        langs: [json, bash, typescript],
        engine: createJavaScriptRegexEngine(),
      })
    })()
  }
  return instance
}
