import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import { getHealth } from "./handlers/getHealth.js"
import { healthEvents } from "./handlers/healthEvents.js"

export function createHealthApp(muleta: Muleta) {
  return new OpenAPIHono()
    .openapi(getHealth.route, getHealth.handler(muleta))
    .openapi(healthEvents.route, healthEvents.handler(muleta))
}
