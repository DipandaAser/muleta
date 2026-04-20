import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import {
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
}
