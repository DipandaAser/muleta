import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { serveStatic } from "@hono/node-server/serve-static"
import { OpenAPIHono } from "@hono/zod-openapi"
import type { createEndpoints } from "./endpoints/index.js"

export interface CreateHandlerOptions {
  endpoints: ReturnType<typeof createEndpoints>
  /**
   * Serve a built SPA (HTML + hashed JS/CSS assets) alongside the API from
   * the same Hono app. When set, any non-/api request returns an asset from
   * `path`, falling back to index.html so the SvelteKit router can handle
   * client-side routes.
   *
   * Omit `assets` for API-only deployments; pass `assets: "bundled"` to use
   * the SPA that ships inside `@muleta-dev/server`'s tarball; pass
   * `assets: { path: "..." }` to point at a custom build directory (used by
   * the standalone app pre-publish, where `dist/ui/` doesn't exist yet).
   */
  assets?: "bundled" | { path: string }
  /**
   * Mount path the dashboard will be served at — pinned into the SPA's
   * `__MULETA_BASE__` global so its API client targets the right URL.
   * Optional; when omitted, the handler derives the base from each
   * request's pathname (works for native Hono mounts where the sub-app's
   * request URL reflects the full mount).
   *
   * Set this when your host framework rewrites the request URL before
   * the handler sees it (e.g. Express's `app.use(path, mw)` strips the
   * matched prefix), so the SPA's client still knows the original mount.
   * Does NOT affect routing — that's your framework's job.
   */
  basePath?: string
}

/**
 * Resolve the path to the SPA bundle that ships inside this package's
 * tarball. We walk up from this module's location to find the
 * package's `package.json`, then look for `dist/ui/` next to it. That
 * way the same code works whether the module is loaded from compiled
 * `dist/handler.js` (post-build / post-install) OR from the original
 * `src/handler.ts` (dev via tsx in the monorepo) — both find the same
 * `<package-root>/dist/ui` location.
 *
 * Throws a clear error if `dist/ui/` is missing — usually means
 * `pnpm --filter @muleta-dev/server build` hasn't run yet, or in the
 * unlikely case of a published-tarball packaging bug.
 */
function bundledUiPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(resolve(dir, "package.json"))) {
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error("[muleta] could not locate package root from handler module")
    }
    dir = parent
  }
  const uiDir = resolve(dir, "dist", "ui")
  if (!existsSync(uiDir)) {
    throw new Error(
      `[muleta] SPA bundle missing at ${uiDir}. ` +
        `If you're developing in the muleta repo, run \`pnpm --filter @muleta-dev/server build\` first. ` +
        `If you installed @muleta-dev/server from npm, this is a packaging bug — please file an issue.`,
    )
  }
  return uiDir
}

/**
 * Index-html bytes with an inlined `<script>` that pins the API's base
 * URL to whatever path the request was served from. The dashboard's
 * client uses this to construct `/api/v1/*` URLs that survive being
 * mounted under `/admin/queues`, a subdomain, or anywhere else —
 * without rebuilding the SPA per mount path.
 *
 * We strip the trailing `index.html` (or trailing `/`) from the request
 * path to recover the mount root, and JSON-encode the value so a
 * pathological mount path can't break out of the script string.
 */
function injectBaseUrl(html: string, mountPath: string): string {
  const base = mountPath.replace(/\/?(index\.html)?$/, "")
  const tag = `<script>window.__MULETA_BASE__=${JSON.stringify(base)};</script>`
  // Inject just after <head> so the global is set before any module
  // loads; falls back to prepending if there's no <head> for some reason.
  return html.includes("<head>") ? html.replace("<head>", `<head>${tag}`) : tag + html
}

export function createHandler(opts: CreateHandlerOptions) {
  const app = new OpenAPIHono().route("/api/v1", opts.endpoints)

  if (opts.assets) {
    const path = opts.assets === "bundled" ? bundledUiPath() : opts.assets.path

    // index.html is intercepted so we can inject the base-URL global.
    // Cached at startup since the file is immutable post-build.
    const indexHtml = readFileSync(resolve(path, "index.html"), "utf-8")

    app.use("/*", serveStatic({ root: path }))

    // SPA fallback: any unmatched path returns index.html with the
    // base-URL injection so the client-side router takes over and
    // the API client targets the right origin + mount. Prefer the
    // explicit `basePath` (set by adapters that lose mount info via
    // path stripping); otherwise derive from the request pathname.
    app.get("/*", (c) => {
      const base = opts.basePath ?? new URL(c.req.url).pathname
      return c.html(injectBaseUrl(indexHtml, base))
    })
  }

  return app
}

export type Handler = ReturnType<typeof createHandler>
