import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import { createHealthApp } from "./health/index.js"
import { createQueuesApp } from "./queues/index.js"

export function createEndpoints(muleta: Muleta) {
  return new OpenAPIHono()
    .route("/queues", createQueuesApp(muleta))
    .route("/health", createHealthApp(muleta))
}
