import { createRoute } from "@hono/zod-openapi"
import { InvalidJobStateError, JobNotFoundError } from "@muleta-dev/core"
import { defineEndpoint } from "../../../define.js"
import { ErrorResponseSchema, jobParamsSchema } from "../schema.js"

export const route = createRoute({
  method: "post",
  path: "/{name}/jobs/{id}/promote",
  tags: ["Jobs"],
  request: { params: jobParamsSchema },
  responses: {
    204: { description: "Job promoted to wait list." },
    400: {
      description: "Job isn't in a state that allows promotion (must be delayed).",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Queue isn't registered or job doesn't exist.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
})

export const promoteJob = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name, id } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    try {
      await muleta.queues.promoteJob(name, id)
    } catch (err) {
      if (err instanceof JobNotFoundError) return c.json({ error: "job not found" }, 404)
      if (err instanceof InvalidJobStateError) return c.json({ error: err.message }, 400)
      throw err
    }
    return c.body(null, 204)
  },
})
