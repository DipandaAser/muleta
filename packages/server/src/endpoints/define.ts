import type { RouteConfig, RouteHandler } from "@hono/zod-openapi"
import type { Muleta } from "@muleta-dev/core"

/**
 * Shape of a single HTTP endpoint: its zod-openapi route definition plus a
 * factory that binds a handler to a {@link Muleta} instance. Every file under
 * `endpoints/*\/handlers/` exports one of these so the app assembler can
 * register them uniformly with `.openapi(e.route, e.handler(muleta))`.
 */
export interface Endpoint<R extends RouteConfig> {
  route: R
  handler(muleta: Muleta): RouteHandler<R>
}

/** Identity helper — its only job is to type-check the shape at the definition site. */
export function defineEndpoint<R extends RouteConfig>(e: Endpoint<R>): Endpoint<R> {
  return e
}
