import { createRoute, z } from "@hono/zod-openapi"
import { defineEndpoint } from "../../../define.js"
import { ListJobSchedulersResponseSchema } from "../schema.js"

export const route = createRoute({
  method: "get",
  path: "/{name}/schedulers",
  tags: ["Queues"],
  request: {
    params: z.object({
      name: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: "All job schedulers registered on this queue, soonest-first.",
      content: { "application/json": { schema: ListJobSchedulersResponseSchema } },
    },
    404: { description: "Queue is not registered." },
  },
})

export const listSchedulers = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    const schedulers = await muleta.queues.getJobSchedulers(name)
    return c.json({ schedulers }, 200)
  },
})
