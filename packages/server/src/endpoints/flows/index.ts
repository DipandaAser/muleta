import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta-dev/core"
import { listAllFlows } from "./handlers/listAllFlows.js"

/**
 * Cross-queue flow endpoints. Per-queue listing + tree walk live under
 * `/queues/:name/flows[/:id]` (see `endpoints/queues/flows`); this app
 * powers the global Flows screen in the dashboard sidebar.
 */
export function createFlowsApp(muleta: Muleta) {
  return new OpenAPIHono().openapi(listAllFlows.route, listAllFlows.handler(muleta))
}
