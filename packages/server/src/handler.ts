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
   * Omit for API-only deployments (consumer hosts the UI elsewhere).
   */
  assets?: {
    path: string
  }
}

export function createHandler(opts: CreateHandlerOptions) {
  const app = new OpenAPIHono().route("/api/v1", opts.endpoints)

  if (opts.assets) {
    const { path } = opts.assets
    app.use("/*", serveStatic({ root: path }))
    // SPA fallback: any unmatched path returns index.html so the client-side
    // router handles it. API routes are registered earlier so they win the match.
    app.get("/*", serveStatic({ path: "index.html", root: path }))
  }

  return app
}

export type Handler = ReturnType<typeof createHandler>
