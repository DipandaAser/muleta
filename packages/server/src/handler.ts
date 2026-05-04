import { readFileSync } from "node:fs"
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
}

/**
 * Resolve the path to the SPA bundle that ships inside this package's
 * tarball. After `pnpm build`, `scripts/bundle-ui.mjs` copies the
 * SvelteKit static output into `dist/ui/`. From a consumer's perspective
 * (after `npm install @muleta-dev/server`) the file lives at
 * `node_modules/@muleta-dev/server/dist/ui/`.
 */
function bundledUiPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "ui")
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
    // the API client targets the right origin + mount.
    app.get("/*", (c) => c.html(injectBaseUrl(indexHtml, new URL(c.req.url).pathname)))
  }

  return app
}

export type Handler = ReturnType<typeof createHandler>
