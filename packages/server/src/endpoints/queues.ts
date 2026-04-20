import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import { ListQueuesResponseSchema } from "../schemas.js"

export const listQueuesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Queues"],
  responses: {
    200: {
      description: "List all registered queues with their counts and paused state.",
      content: {
        "application/json": { schema: ListQueuesResponseSchema },
      },
    },
  },
})

export function createQueuesApp(muleta: Muleta) {
  return new OpenAPIHono().openapi(listQueuesRoute, async (c) => {
    const queues = await muleta.queues.list()
    return c.json({ queues }, 200)
  })
}
