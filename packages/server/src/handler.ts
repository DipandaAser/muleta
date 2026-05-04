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
   * Mount path the dashboard is served at, e.g. `/admin/queues`. Used
   * to (1) inject the SPA's `__MULETA_BASE__` global so its API client
   * and SvelteKit router know where they're mounted, and (2) strip the
   * prefix when looking up static assets on disk. Required when
   * mounting under any sub-path; omit (or set to `""`) when serving at
   * root.
   *
   * Cannot be auto-derived: in native Hono mounts the sub-app sees the
   * unaltered request URL, so we can't tell the mount root apart from a
   * deep-linked SPA route. Express-style adapters strip the prefix
   * before the handler runs, so we lose the mount entirely. Pass it
   * explicitly. Does NOT affect routing — that's your framework's job.
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
 * Rewrite the cached index.html for the request's mount path.
 *
 * SvelteKit's static-adapter fallback HTML bakes in three things that
 * assume the SPA is served from `/`:
 *   1. Asset URLs like `/_app/immutable/.../start.js`
 *   2. `__sveltekit_<id> = { base: "" }` — the client router's base
 *   3. Our own API client (which reads `window.__MULETA_BASE__`)
 *
 * To make the same bundle work under any mount (`/admin/queues`, a
 * subdomain, etc.) we patch all three per-request:
 *   - Inject `window.__MULETA_BASE__` so our API client targets
 *     `<mount>/api/v1/*`.
 *   - Replace SvelteKit's `base: ""` with `base: "<mount>"` so client
 *     routing and `$app/paths` resolve correctly.
 *   - Prefix `"/_app/` URLs with the mount so the browser's initial
 *     modulepreload / dynamic imports hit our static file handler at
 *     `<mount>/_app/...` instead of 404'ing at root.
 *
 * We strip a trailing `index.html` or `/` from the request path so the
 * mount root is computed cleanly, and JSON-encode injected values so a
 * pathological mount path can't escape the script string.
 */
function injectBaseUrl(html: string, mountPath: string): string {
  const base = mountPath.replace(/\/?(index\.html)?$/, "")
  const tag = `<script>window.__MULETA_BASE__=${JSON.stringify(base)};</script>`
  let out = html.includes("<head>") ? html.replace("<head>", `<head>${tag}`) : tag + html
  out = out.replace(
    /(__sveltekit_[a-z0-9]+\s*=\s*\{\s*base:\s*)""/,
    `$1${JSON.stringify(base)}`,
  )
  if (base) out = out.replace(/(["'(])\/_app\//g, `$1${base}/_app/`)
  return out
}

export function createHandler(opts: CreateHandlerOptions) {
  const app = new OpenAPIHono().route("/api/v1", opts.endpoints)

  if (opts.assets) {
    const path = opts.assets === "bundled" ? bundledUiPath() : opts.assets.path

    // index.html is intercepted so we can inject the base-URL global
    // every time. Cached at startup since the file is immutable
    // post-build.
    const indexHtml = readFileSync(resolve(path, "index.html"), "utf-8")

    // Native Hono mounts (`app.route("/admin/queues", dashboard)`) do
    // NOT strip the prefix from `c.req.path`, so `serveStatic` would
    // look up `<dist/ui>/admin/queues/_app/foo.js` (404) instead of
    // `<dist/ui>/_app/foo.js`. Express adapters DO strip. Strip the
    // configured `basePath` here so both modes hit the same on-disk
    // path. Caller-provided `basePath` is the source of truth — there's
    // no reliable way to derive the mount from `c.req.url` in native
    // Hono, since Hono passes the unaltered URL down to the sub-app.
    const base = opts.basePath ?? ""
    const stripBase = (p: string): string => {
      if (!base) return p
      if (p === base) return "/"
      if (p.startsWith(`${base}/`)) return p.slice(base.length)
      return p
    }

    // Static assets (anything with a file extension — `_app/*.js`,
    // `_app/*.css`, `favicon.ico`, etc.) are served raw from disk.
    // Path-only requests (e.g. `/`, `/queues/emails`, `/jobs/123/data`)
    // fall through to the SPA fallback below, which injects
    // __MULETA_BASE__ into index.html — without this guard,
    // `serveStatic` would also serve `index.html` directly and skip
    // the injection, so the SPA's API client would default to the
    // page origin and miss the mount prefix.
    app.use("/*", async (c, next) => {
      if (/\.[a-z0-9]+$/i.test(new URL(c.req.url).pathname)) {
        return serveStatic({ root: path, rewriteRequestPath: stripBase })(c, next)
      }
      await next()
    })

    // SPA fallback. Inject the configured base path so the SPA's API
    // client and SvelteKit router know where they're mounted.
    app.get("/*", (c) => c.html(injectBaseUrl(indexHtml, base)))
  }

  return app
}

export type Handler = ReturnType<typeof createHandler>
