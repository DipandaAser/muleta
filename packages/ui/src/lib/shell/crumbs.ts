import type { Component } from "svelte"
import type { RouteId } from "$app/types"

/**
 * A single breadcrumb in the Topbar. The shape the Topbar consumes —
 * `href` is always populated by the time a `Crumb` reaches the template.
 */
export interface Crumb {
  label: string
  href: string
  /**
   * Optional Lucide-style icon component. Components in route modules are
   * fine in SPA mode (which muleta runs in) — they're never serialised.
   */
  icon?: Component
  /** Extra Tailwind classes applied to the icon (e.g. `rotate-180`). */
  iconClass?: string
}

/**
 * What a `_crumb` function returns. `href` is **optional** — the registry
 * fills it in by substituting `params` into the route ID the file lives
 * under. Override only when a crumb should link somewhere other than its
 * own route (rare).
 */
export type CrumbInput = Omit<Crumb, "href"> & { href?: string }

/**
 * Context passed to a `_crumb` function: the params for the current route
 * (so a level can fall back to slug labels) and the merged `page.data`
 * (so a level can read fields its or any descendant's `load` returned).
 *
 * Returning `null` from a `_crumb` function omits that level — useful for
 * routes that exist in the file tree but shouldn't appear in the chain.
 */
export interface CrumbContext {
  params: Record<string, string>
  data: App.PageData
}

export type CrumbFn = (ctx: CrumbContext) => CrumbInput | null

/**
 * Resolve a route ID against current params, e.g.
 * `routeHref("/queues/[name]/jobs/[id]", { name: "emails", id: "42" })`
 * → `/queues/emails/jobs/42`.
 *
 * Used by the crumb registry to auto-fill `href` when a `_crumb` doesn't
 * provide one, and exported for any other code that wants the same
 * convenience. Doesn't handle SvelteKit's `[[optional]]` / `[...rest]` /
 * matcher syntax — muleta doesn't use them.
 */
export function routeHref(routeId: RouteId, params: Record<string, string>): string {
  return routeId.replace(/\[(\w+)\]/g, (_, key: string) => params[key] ?? "")
}
