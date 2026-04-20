import { OpenAPIHono } from "@hono/zod-openapi"
import type { createEndpoints } from "./endpoints/index.js"

export interface CreateHandlerOptions {
  endpoints: ReturnType<typeof createEndpoints>
}

export function createHandler(opts: CreateHandlerOptions) {
  return new OpenAPIHono().route("/api/v1", opts.endpoints)
}

export type Handler = ReturnType<typeof createHandler>
