import { OpenAPIHono } from "@hono/zod-openapi"
import type { Endpoints } from "./endpoints/index.js"

export interface CreateHandlerOptions {
  endpoints: Endpoints
}

export type Handler = OpenAPIHono

export function createHandler(opts: CreateHandlerOptions): Handler {
  const app = new OpenAPIHono()
  const api = new OpenAPIHono()

  opts.endpoints(api)
  app.route("/api/v1", api)

  return app
}
