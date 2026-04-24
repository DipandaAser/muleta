import { createRoute } from "@hono/zod-openapi"
import { JobNotFoundError } from "@muleta-dev/core"
import { defineEndpoint } from "../../../define.js"
import { ErrorResponseSchema, jobParamsSchema } from "../schema.js"

export const route = createRoute({
  method: "delete",
  path: "/{name}/jobs/{id}",
  tags: ["Jobs"],
  request: { params: jobParamsSchema },
  responses: {
    204: { description: "Job removed." },
    404: {
      description: "Queue isn't registered or job doesn't exist.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
})

export const removeJob = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name, id } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    try {
      await muleta.queues.removeJob(name, id)
    } catch (err) {
      if (err instanceof JobNotFoundError) return c.json({ error: "job not found" }, 404)
      throw err
    }
    return c.body(null, 204)
  },
})
