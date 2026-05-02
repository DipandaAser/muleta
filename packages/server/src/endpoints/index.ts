import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta-dev/core"
import { createHealthApp } from "./health/index.js"
import { createJobsApp } from "./jobs/index.js"
import { createQueuesApp } from "./queues/index.js"
import { createWorkersApp } from "./workers/index.js"

export function createEndpoints(muleta: Muleta) {
  return new OpenAPIHono()
    .route("/queues", createQueuesApp(muleta))
    .route("/jobs", createJobsApp(muleta))
    .route("/workers", createWorkersApp(muleta))
    .route("/health", createHealthApp(muleta))
}
