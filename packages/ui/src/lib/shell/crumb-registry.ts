import type { RouteId } from "$app/types"
import { type Crumb, type CrumbContext, type CrumbFn, routeHref } from "./crumbs"

/**
 * Registry of `_crumb` functions discovered at build time via Vite's
 * `import.meta.glob`. Each route can opt in by exporting `_crumb` from
 * its `+layout.ts` or `+page.ts`; the eager glob picks them up so the
 * walk at render time is sync — no async dynamic import overhead, no UI
 * suspense.
 *
 * The `_` prefix is required: SvelteKit reserves the un-prefixed export
 * namespace on `+layout.ts` / `+page.ts` for its own conventions
 * (`load`, `prerender`, …) and warns on anything else. Anything starting
 * with `_` is officially user-defined and ignored by the framework.
 *
 * If a prefix has both a `+layout.ts` and a `+page.ts` exporting `_crumb`,
 * the layout wins — layouts wrap children, so they're the natural home
 * for "this section of the path" labels. Pages can still register their
 * own crumb if no layout exists at that prefix.
 */
const ROUTE_MODULES = import.meta.glob<{ _crumb?: CrumbFn }>("/src/routes/**/+{layout,page}.ts", {
  eager: true,
})

/**
 * `/src/routes/queues/[name]/+layout.ts` → `/queues/[name]`. The root
 * layout (`/src/routes/+layout.ts`) maps to `/`.
 */
function pathToRouteId(path: string): RouteId {
  const trimmed = path.replace(/^.*\/src\/routes/, "").replace(/\/\+(?:layout|page)\.ts$/, "")
  return (trimmed === "" ? "/" : trimmed) as RouteId
}

const REGISTRY: ReadonlyMap<RouteId, CrumbFn> = (() => {
  const out = new Map<RouteId, CrumbFn>()
  // Two passes so layouts seed their prefix first; pages then only fill
  // gaps for prefixes the layouts didn't claim.
  const entries = Object.entries(ROUTE_MODULES)
  for (const [path, mod] of entries) {
    if (!path.endsWith("+layout.ts") || !mod._crumb) continue
    out.set(pathToRouteId(path), mod._crumb)
  }
  for (const [path, mod] of entries) {
    if (!path.endsWith("+page.ts") || !mod._crumb) continue
    const id = pathToRouteId(path)
    if (!out.has(id)) out.set(id, mod._crumb)
  }
  return out
})()

/**
 * Walk the current route ID prefix-by-prefix and build the chain by
 * calling each registered `_crumb`. Levels without a registered crumb
 * are skipped silently.
 *
 * `_crumb` functions only need to return `{ label, icon? }`. The walker
 * fills in `href` by resolving the prefix against `params`, so a folder
 * rename automatically updates the link. Crumbs that need a custom href
 * (rare — pointing somewhere outside their own route) can still set one
 * explicitly and it's used as-is.
 *
 * `/queues/[name]/jobs/[id]/data` walks `/`, `/queues`, `/queues/[name]`,
 * `/queues/[name]/jobs`, `/queues/[name]/jobs/[id]`, and finally
 * `/queues/[name]/jobs/[id]/data`. Tab-suffix routes typically don't
 * register a crumb because the parent layout already represents the job;
 * the tab strip handles tab navigation in-page.
 */
export function buildCrumbs(
  routeId: RouteId | null,
  params: Record<string, string>,
  data: App.PageData,
): Crumb[] {
  if (!routeId) return []
  const ctx: CrumbContext = { params, data }
  const out: Crumb[] = []
  const segs = routeId.split("/").filter(Boolean)
  for (let i = 0; i <= segs.length; i++) {
    const prefix = (i === 0 ? "/" : `/${segs.slice(0, i).join("/")}`) as RouteId
    const fn = REGISTRY.get(prefix)
    if (!fn) continue
    const input = fn(ctx)
    if (!input) continue
    out.push({ ...input, href: input.href ?? routeHref(prefix, params) })
  }
  return out
}
