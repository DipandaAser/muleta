import { createRoute, z } from "@hono/zod-openapi"
import { defineEndpoint } from "../../../define.js"
import { ListFlowsResponseSchema } from "../schema.js"

export const route = createRoute({
  method: "get",
  path: "/{name}/flows",
  tags: ["Queues"],
  request: {
    params: z.object({ name: z.string().min(1) }),
  },
  responses: {
    200: {
      description:
        "Flow roots (parent jobs with at least one child) on this queue, newest-first. Bounded scan over the most recent ~100 jobs.",
      content: { "application/json": { schema: ListFlowsResponseSchema } },
    },
    404: { description: "Queue is not registered." },
  },
})

export const listFlows = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    const flows = await muleta.queues.getFlows(name)
    return c.json({ flows }, 200)
  },
})
