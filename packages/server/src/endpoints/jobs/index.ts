import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta-dev/core"
import { getJobNames } from "./handlers/getJobNames.js"

/**
 * Cross-queue job endpoints. Lives outside `/queues/:name` because these are
 * intentionally not queue-scoped — the picker's job-name list spans every
 * queue muleta knows about.
 */
export function createJobsApp(muleta: Muleta) {
  return new OpenAPIHono().openapi(getJobNames.route, getJobNames.handler(muleta))
}
