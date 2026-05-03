import { createRoute } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"
import { ListJobSchedulersResponseSchema } from "../../queues/schedulers/schema.js"

export const route = createRoute({
  method: "get",
  path: "/",
  tags: ["Schedulers"],
  responses: {
    200: {
      description:
        "Every job scheduler across every registered queue, ordered globally by next fire time (soonest first).",
      content: { "application/json": { schema: ListJobSchedulersResponseSchema } },
    },
  },
})

export const listAllSchedulers = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const schedulers = await muleta.queues.getAllJobSchedulers()
    return c.json({ schedulers }, 200)
  },
})
