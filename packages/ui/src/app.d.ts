// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { JobDetail, Queue } from "$lib/api/client"

declare global {
  /** Inlined by Vite from `@muleta-dev/server`'s package.json + git. */
  const __MULETA_VERSION__: string

  namespace App {
    // interface Error {}
    // interface Locals {}
    /**
     * Cross-cutting fields that route loads return and that the breadcrumb
     * registry reads in `_crumb` functions. Listed centrally so a crumb fn
     * can read `data.queue?.displayName` without per-route casts. SvelteKit
     * still generates the per-route `LayoutData` / `PageData` types for
     * load callers — this just keeps the global `page.data` shape honest.
     */
    interface PageData {
      queue?: Queue
      job?: JobDetail
    }
    // interface PageState {}
    // interface Platform {}
  }
}
