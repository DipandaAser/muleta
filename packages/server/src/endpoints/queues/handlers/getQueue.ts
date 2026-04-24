import { createRoute, z } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"
import { QueueInfoSchema } from "../schema.js"

export const route = createRoute({
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

export const getQueue = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    const info = await muleta.queues.get(name)
    return c.json(info, 200)
  },
})
