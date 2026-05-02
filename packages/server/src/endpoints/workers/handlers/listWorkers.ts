import { createRoute } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"
import { ListWorkersResponseSchema } from "../schemas.js"

export const route = createRoute({
  method: "get",
  path: "/",
  tags: ["Workers"],
  responses: {
    200: {
      description:
        "All workers connected to any registered queue. Driven by Redis CLIENT LIST via BullMQ — host flavours that block the command (e.g. GCP Memorystore) yield an empty list rather than an error.",
      content: { "application/json": { schema: ListWorkersResponseSchema } },
    },
  },
})

export const listWorkers = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const workers = await muleta.queues.getWorkers()
    return c.json({ workers }, 200)
  },
})
