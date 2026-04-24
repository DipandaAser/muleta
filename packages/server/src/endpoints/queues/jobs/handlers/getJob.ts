import { createRoute } from "@hono/zod-openapi"
import { defineEndpoint } from "../../../define.js"
import { ErrorResponseSchema, JobDetailSchema, jobParamsSchema } from "../schema.js"

export const route = createRoute({
  method: "get",
  path: "/{name}/jobs/{id}",
  tags: ["Jobs"],
  request: { params: jobParamsSchema },
  responses: {
    200: {
      description: "Full job detail including opts, stacktrace, return value, logs.",
      content: { "application/json": { schema: JobDetailSchema } },
    },
    404: {
      description: "Queue isn't registered or job doesn't exist.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
})

export const getJob = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name, id } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    const detail = await muleta.queues.getJob(name, id)
    if (!detail) return c.json({ error: "job not found" }, 404)
    return c.json(detail, 200)
  },
})
