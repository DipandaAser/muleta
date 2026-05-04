import type { IncomingMessage, ServerResponse } from "node:http"
import { getRequestListener } from "@hono/node-server"

interface FetchHandler {
  fetch(req: Request, ...rest: unknown[]): Response | Promise<Response>
}

type ExpressMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void

/**
 * Adapt a muleta handler (or any Hono app) to Express middleware.
 *
 * @example
 * ```ts
 * import express from "express"
 * import { createMuleta } from "@muleta-dev/core"
 * import { createEndpoints, createHandler } from "@muleta-dev/server"
 * import { honoToExpress } from "@muleta-dev/server/express"
 *
 * const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
 * const dashboard = createHandler({
 *   endpoints: createEndpoints(muleta),
 *   assets: "bundled",
 *   basePath: "/admin/queues", // Express strips this from req.url, so we pin it explicitly for the SPA client
 * })
 *
 * const app = express()
 * app.use("/admin/queues", honoToExpress(dashboard))
 * app.listen(3000)
 * ```
 *
 * Express's `app.use(path, mw)` strips the matched prefix from `req.url`
 * before invoking the middleware, so Hono's `/api/v1/*` routes match
 * directly. Pass `basePath` to `createHandler` so the SPA's client
 * still targets the original mount path after navigation.
 *
 * Errors propagate to Express's `next(err)` so the host's error
 * middleware handles them.
 */
export function honoToExpress(handler: FetchHandler): ExpressMiddleware {
  const listener = getRequestListener(handler.fetch.bind(handler))
  return (req, res, next) => {
    Promise.resolve(listener(req, res)).catch(next)
  }
}
