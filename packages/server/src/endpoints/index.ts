import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import { mountQueueEndpoints } from "./queues.js"

/** River-UI-style split: raw route bundle, mounted separately from the HTTP shell. */
export type Endpoints = (app: OpenAPIHono) => void

export function createEndpoints(muleta: Muleta): Endpoints {
  return (app) => {
    mountQueueEndpoints(app, muleta)
  }
}
