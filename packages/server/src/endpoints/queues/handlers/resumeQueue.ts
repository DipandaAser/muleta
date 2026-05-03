import { createRoute, z } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"

export const route = createRoute({
  method: "post",
  path: "/{name}/resume",
  tags: ["Queues"],
  request: {
    params: z.object({
      name: z.string().min(1),
    }),
  },
  responses: {
    204: { description: "Queue resumed. Workers can pick up new jobs again." },
    404: { description: "Queue is not registered." },
  },
})

export const resumeQueue = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    await muleta.queues.resumeQueue(name)
    return c.body(null, 204)
  },
})
