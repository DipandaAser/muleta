import type * as MonacoNs from "monaco-editor"
import { getHighlighter } from "./highlighter"

/**
 * Lazy bootstrap for the Monaco editor + Shiki tokenizer bridge. Returns
 * the loaded `monaco` namespace, ready to mount editors.
 *
 * Why a singleton:
 * - Monaco's first load is heavy (~1.5 MB gzipped including workers + the
 *   default services); we only want to pay it once per session.
 * - Shiki's `shikiToMonaco(highlighter, monaco)` mutates the `monaco`
 *   namespace by registering languages and themes globally — calling it
 *   twice on the same monaco would duplicate-register tokenizers.
 *
 * Why dynamic-imported:
 * - Monaco is browser-only (uses Web Workers, `document`). Importing it
 *   eagerly would break SSR even if SSR is disabled — Vite still resolves
 *   imports at build time. Lazy import keeps it out of the SPA's initial
 *   chunk so pages without `<CodeEditor>` never pay for it.
 */

let instance: Promise<typeof MonacoNs> | null = null

export function getMonaco(): Promise<typeof MonacoNs> {
  if (!instance) instance = bootstrap()
  return instance
}

async function bootstrap(): Promise<typeof MonacoNs> {
  // Monaco discovers its workers via `self.MonacoEnvironment`. Each language
  // service runs in its own worker; the default editor worker handles
  // everything not covered by a specialised one. Vite's `?worker&url`
  // hashes the worker output and emits it as a separate chunk — same
  // bundling story as any other dynamic import.
  type WorkerCtor = new () => Worker
  const [
    { default: EditorWorker },
    { default: JsonWorker },
    { default: CssWorker },
    { default: HtmlWorker },
    { default: TsWorker },
    monaco,
  ] = await Promise.all([
    import("monaco-editor/esm/vs/editor/editor.worker?worker") as Promise<{
      default: WorkerCtor
    }>,
    import("monaco-editor/esm/vs/language/json/json.worker?worker") as Promise<{
      default: WorkerCtor
    }>,
    import("monaco-editor/esm/vs/language/css/css.worker?worker") as Promise<{
      default: WorkerCtor
    }>,
    import("monaco-editor/esm/vs/language/html/html.worker?worker") as Promise<{
      default: WorkerCtor
    }>,
    import("monaco-editor/esm/vs/language/typescript/ts.worker?worker") as Promise<{
      default: WorkerCtor
    }>,
    import("monaco-editor"),
  ])

  // biome-ignore lint/suspicious/noExplicitAny: MonacoEnvironment is a global Monaco contract.
  ;(self as any).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      switch (label) {
        case "json":
          return new JsonWorker()
        case "css":
        case "scss":
        case "less":
          return new CssWorker()
        case "html":
        case "handlebars":
        case "razor":
          return new HtmlWorker()
        case "typescript":
        case "javascript":
          return new TsWorker()
        default:
          return new EditorWorker()
      }
    },
  }

  // Bridge Shiki's tokenizer + themes into Monaco. After this call,
  // Monaco understands the languages we already loaded for `<Code>`
  // (ts, json, bash, …) and can render them with the muleta-dark /
  // muleta-light themes — same palette as `<Code>` blocks.
  const [{ shikiToMonaco }, highlighter] = await Promise.all([
    import("@shikijs/monaco"),
    getHighlighter(),
  ])
  shikiToMonaco(highlighter, monaco)

  return monaco
}
