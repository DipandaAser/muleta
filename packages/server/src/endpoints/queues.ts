import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { InvalidJobStateError, JobNotFoundError, type Muleta } from "@muleta/core"
import {
  ErrorResponseSchema,
  JobDetailSchema,
  JobStateSchema,
  ListJobsResponseSchema,
  ListQueuesResponseSchema,
  QueueInfoSchema,
} from "../schemas.js"

export const listQueuesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Queues"],
  responses: {
    200: {
      description: "List all registered queues with their counts and paused state.",
      content: { "application/json": { schema: ListQueuesResponseSchema } },
    },
  },
})

export const getQueueRoute = createRoute({
  method: "get",
  path: "/{name}",
  tags: ["Queues"],
  request: {
    params: z.object({
      name: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: "Single queue with counts and paused state.",
      content: { "application/json": { schema: QueueInfoSchema } },
    },
    404: { description: "Queue is not registered." },
  },
})

/**
 * `state` accepts either one state or a comma-separated list:
 *   ?state=failed
 *   ?state=waiting,active,failed
 * Split here so callers can filter by multiple states without repeated params.
 */
const StateListQuerySchema = z.string().transform((raw, ctx) => {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    ctx.addIssue({ code: "custom", message: "state must not be empty" })
    return z.NEVER
  }
  const parsed: Array<z.infer<typeof JobStateSchema>> = []
  for (const p of parts) {
    const r = JobStateSchema.safeParse(p)
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: `invalid state: ${p}` })
      return z.NEVER
    }
    parsed.push(r.data)
  }
  return parsed
})

export const listJobsRoute = createRoute({
  method: "get",
  path: "/{name}/jobs",
  tags: ["Queues"],
  request: {
    params: z.object({
      name: z.string().min(1),
    }),
    query: z.object({
      state: StateListQuerySchema,
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      offset: z.coerce.number().int().min(0).optional().default(0),
      asc: z.coerce.boolean().optional().default(false),
    }),
  },
  responses: {
    200: {
      description: "Page of jobs in the given state(s), newest-first by default.",
      content: { "application/json": { schema: ListJobsResponseSchema } },
    },
    404: { description: "Queue is not registered." },
  },
})

const jobParamsSchema = z.object({
  name: z.string().min(1),
  id: z.string().min(1),
})

export const getJobRoute = createRoute({
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

export const deleteJobRoute = createRoute({
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

export const retryJobRoute = createRoute({
  method: "post",
  path: "/{name}/jobs/{id}/retry",
  tags: ["Jobs"],
  request: { params: jobParamsSchema },
  responses: {
    204: { description: "Job requeued." },
    400: {
      description: "Job isn't in a state that allows retry (must be failed).",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Queue isn't registered or job doesn't exist.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
})

export const promoteJobRoute = createRoute({
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

export function createQueuesApp(muleta: Muleta) {
  return new OpenAPIHono()
    .openapi(listQueuesRoute, async (c) => {
      const queues = await muleta.queues.list()
      return c.json({ queues }, 200)
    })
    .openapi(getQueueRoute, async (c) => {
      const { name } = c.req.valid("param")
      if (!muleta.queues.has(name)) {
        return c.json({ error: "queue not registered" }, 404)
      }
      const info = await muleta.queues.get(name)
      return c.json(info, 200)
    })
    .openapi(listJobsRoute, async (c) => {
      const { name } = c.req.valid("param")
      if (!muleta.queues.has(name)) {
        return c.json({ error: "queue not registered" }, 404)
      }
      const { state: states, limit, offset, asc } = c.req.valid("query")
      const result = await muleta.queues.getJobs(name, {
        states,
        start: offset,
        end: offset + limit - 1,
        asc,
      })
      return c.json(result, 200)
    })
    .openapi(getJobRoute, async (c) => {
      const { name, id } = c.req.valid("param")
      if (!muleta.queues.has(name)) {
        return c.json({ error: "queue not registered" }, 404)
      }
      const detail = await muleta.queues.getJob(name, id)
      if (!detail) return c.json({ error: "job not found" }, 404)
      return c.json(detail, 200)
    })
    .openapi(deleteJobRoute, async (c) => {
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
    })
    .openapi(retryJobRoute, async (c) => {
      const { name, id } = c.req.valid("param")
      if (!muleta.queues.has(name)) {
        return c.json({ error: "queue not registered" }, 404)
      }
      try {
        await muleta.queues.retryJob(name, id)
      } catch (err) {
        if (err instanceof JobNotFoundError) return c.json({ error: "job not found" }, 404)
        if (err instanceof InvalidJobStateError) return c.json({ error: err.message }, 400)
        throw err
      }
      return c.body(null, 204)
    })
    .openapi(promoteJobRoute, async (c) => {
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
    })
}
