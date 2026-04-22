import { createRoute } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"
import { ListQueuesResponseSchema } from "../schema.js"

export const route = createRoute({
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

export const listQueues = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const queues = await muleta.queues.list()
    return c.json({ queues }, 200)
  },
})
