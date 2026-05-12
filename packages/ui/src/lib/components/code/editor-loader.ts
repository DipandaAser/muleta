import type * as MonacoNs from "monaco-editor"
import { getHighlighter } from "./highlighter"

/**
 * Lazy bootstrap for the Monaco editor + Shiki tokenizer bridge. Returns
 * the loaded `monaco` namespace, ready to mount editors.
 *
 * Why a singleton:
 * - Monaco's first load is heavy; we only want to pay it once per session.
 * - Shiki's `shikiToMonaco(highlighter, monaco)` mutates the `monaco`
 *   namespace by registering languages and themes globally calling it
 *   twice on the same monaco would duplicate-register tokenizers.
 *
 * Why dynamic-imported:
 * - Monaco is browser-only (uses Web Workers, `document`). Importing it
 *   eagerly would break SSR even if SSR is disabled Vite still resolves
 *   imports at build time. Lazy import keeps it out of the SPA's initial
 *   chunk so pages without `<CodeEditor>` never pay for it.
 *
 * Bundle posture:
 * - Entry is `monaco-editor/esm/vs/editor/editor.api`, not the package
 *   root. The package root pulls in all 50+ `basic-languages` tokenizers
 *   (Python, Rust, C#, …) which we don't use Shiki provides our
 *   tokenizer via `shikiToMonaco`. Switching entries drops ~500 KB–1 MB.
 * - We ship workers for only the languages we actually edit: JSON. Editing
 *   in CodeEditor is JSON-only (job data field). Dropped: ts, css, html
 *   workers, saving another ~1.8 MB raw across the three.
 */

let instance: Promise<typeof MonacoNs> | null = null

export function getMonaco(): Promise<typeof MonacoNs> {
  if (!instance) instance = bootstrap()
  return instance
}

async function bootstrap(): Promise<typeof MonacoNs> {
  type WorkerCtor = new () => Worker
  const [{ default: EditorWorker }, { default: JsonWorker }, monaco] = await Promise.all([
    import("monaco-editor/esm/vs/editor/editor.worker?worker") as Promise<{
      default: WorkerCtor
    }>,
    import("monaco-editor/esm/vs/language/json/json.worker?worker") as Promise<{
      default: WorkerCtor
    }>,
    // monaco-editor's slim entry (`editor.api`) lacks ambient type
    // declarations the package only ships types from its root. Cast
    // to the `typeof MonacoNs` we get from the root-level type-only
    // import at the top of the file. Runtime shape is identical.
    // @ts-expect-error see comment above
    import("monaco-editor/esm/vs/editor/editor.api") as Promise<typeof MonacoNs>,
  ])

  // The slim `editor.api` entry skips ALL `basic-languages` and language
  // contributions including JSON. Without this contribution import,
  // Monaco doesn't even know the `json` language exists, so the editor
  // falls back to plain-text mode (no tokenizer = no syntax colour, no
  // worker hookup = no validation). Importing the JSON contribution
  // registers the language id, wires up the worker via MonacoEnvironment
  // below, and gives us schema-driven validation in the data field.
  // shikiToMonaco then overrides the contribution's default tokenizer
  // with our muleta-themed one.
  // @ts-expect-error no ambient types on this submodule
  await import("monaco-editor/esm/vs/language/json/monaco.contribution")

  // biome-ignore lint/suspicious/noExplicitAny: MonacoEnvironment is a global Monaco contract.
  ;(self as any).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === "json") return new JsonWorker()
      return new EditorWorker()
    },
  }

  // Bridge Shiki's tokenizer + themes into Monaco. After this call,
  // Monaco understands the languages we already loaded for `<Code>`
  // (json, bash) and can render them with the muleta-dark / muleta-light
  // themes same palette as `<Code>` blocks.
  const [{ shikiToMonaco }, highlighter] = await Promise.all([
    import("@shikijs/monaco"),
    getHighlighter(),
  ])

  // shikiToMonaco only bridges languages that are already registered in
  // Monaco. JSON is registered by the contribution imported above;
  // bash and typescript aren't Monaco-native under the slim `editor.api`
  // entry (basic-languages is dropped), so we register them manually
  // before bridging. Otherwise shikiToMonaco silently skips them and
  // the editor falls back to plain text. `typescript` is listed under
  // the `ts` alias too so call sites using either id resolve.
  for (const id of ["bash", "typescript", "ts"]) {
    if (!monaco.languages.getLanguages().some((l) => l.id === id)) {
      monaco.languages.register({ id })
    }
  }

  shikiToMonaco(highlighter, monaco)

  return monaco
}
