import type { IncomingMessage, ServerResponse } from "node:http"
import { getRequestListener } from "@hono/node-server"

interface FetchHandler {
  fetch(req: Request, ...rest: unknown[]): Response | Promise<Response>
}

export interface HonoToNodeOptions {
  /**
   * Strip this prefix from `req.url` before passing to the Hono
   * handler. Use it on frameworks that don't auto-strip the matched
   * mount path (AdonisJS, raw `http.createServer`, h3) so Hono's
   * `/api/v1/*` routes still match. Express callers don't need this
   * — `app.use(path, mw)` strips automatically.
   */
  stripPath?: string
}

/**
 * Adapt a muleta handler (or any Hono app) to a raw Node
 * `(req, res) => Promise<void>` form for frameworks that hand you
 * the underlying `IncomingMessage` / `ServerResponse` (AdonisJS,
 * plain `http.createServer`, h3).
 *
 * @example AdonisJS v6
 * ```ts
 * // start/routes.ts
 * import router from "@adonisjs/core/services/router"
 * import { createMuleta } from "@muleta-dev/core"
 * import { createEndpoints, createHandler } from "@muleta-dev/server"
 * import { honoToNode } from "@muleta-dev/server/node"
 *
 * const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
 * const dashboard = createHandler({
 *   endpoints: createEndpoints(muleta),
 *   assets: "bundled",
 *   basePath: "/admin/queues",
 * })
 *
 * router.any("/admin/queues/*", async ({ request, response }) => {
 *   await honoToNode(dashboard, request.request, response.response, {
 *     stripPath: "/admin/queues",
 *   })
 * })
 * ```
 *
 * @example raw http
 * ```ts
 * import { createServer } from "node:http"
 *
 * createServer(async (req, res) => {
 *   await honoToNode(dashboard, req, res)
 * }).listen(3000)
 * ```
 */
export async function honoToNode(
  handler: FetchHandler,
  req: IncomingMessage,
  res: ServerResponse,
  opts?: HonoToNodeOptions,
): Promise<void> {
  if (opts?.stripPath && req.url?.startsWith(opts.stripPath)) {
    req.url = req.url.slice(opts.stripPath.length) || "/"
  }
  await getRequestListener(handler.fetch.bind(handler))(req, res)
}
