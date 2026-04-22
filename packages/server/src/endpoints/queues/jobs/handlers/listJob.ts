import { createRoute, z } from "@hono/zod-openapi"
import { defineEndpoint } from "../../../define.js"
import { JobStateSchema, ListJobsResponseSchema } from "../schema.js"

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

export const route = createRoute({
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

export const listJob = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
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
  },
})
