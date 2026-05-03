import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta-dev/core"
import { listAllSchedulers } from "./handlers/listAllSchedulers.js"

/**
 * Cross-queue scheduler endpoints. Per-queue listing lives under
 * `/queues/:name/schedulers` (see `endpoints/queues/schedulers`); this
 * app powers the global Schedulers screen in the dashboard sidebar.
 */
export function createSchedulersApp(muleta: Muleta) {
  return new OpenAPIHono().openapi(listAllSchedulers.route, listAllSchedulers.handler(muleta))
}
