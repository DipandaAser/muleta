import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import { createQueuesApp } from "./queues.js"

export function createEndpoints(muleta: Muleta) {
  return new OpenAPIHono().route("/queues", createQueuesApp(muleta))
}
