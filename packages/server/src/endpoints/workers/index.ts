import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta-dev/core"
import { listWorkers } from "./handlers/listWorkers.js"

/**
 * Worker endpoints. Currently a single read-only listing — eventually
 * a place for per-worker actions (pause/resume/inspect) once the worker
 * side surfaces enough hooks to drive them.
 */
export function createWorkersApp(muleta: Muleta) {
  return new OpenAPIHono().openapi(listWorkers.route, listWorkers.handler(muleta))
}
