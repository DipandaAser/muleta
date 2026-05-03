import { createRoute, z } from "@hono/zod-openapi"
import { defineEndpoint } from "../../../define.js"

export const route = createRoute({
  method: "delete",
  path: "/{name}/schedulers/{id}",
  tags: ["Queues"],
  request: {
    params: z.object({
      name: z.string().min(1),
      id: z.string().min(1),
    }),
  },
  responses: {
    204: { description: "Scheduler was removed." },
    404: {
      description: "Queue is not registered, or no scheduler with that id exists on the queue.",
    },
  },
})

export const removeScheduler = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name, id } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    const removed = await muleta.queues.removeJobScheduler(name, id)
    if (!removed) {
      return c.json({ error: "scheduler not found" }, 404)
    }
    return c.body(null, 204)
  },
})
