import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import { createHealthApp } from "./health.js"
import { createQueuesApp } from "./queues.js"

export function createEndpoints(muleta: Muleta) {
  return new OpenAPIHono()
    .route("/queues", createQueuesApp(muleta))
    .route("/health", createHealthApp(muleta))
}
