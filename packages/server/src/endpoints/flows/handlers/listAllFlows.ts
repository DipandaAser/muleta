import { createRoute } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"
import { ListFlowsResponseSchema } from "../../queues/flows/schema.js"

export const route = createRoute({
  method: "get",
  path: "/",
  tags: ["Flows"],
  responses: {
    200: {
      description:
        "Every flow root across every registered queue, ordered globally newest-first by `addedAt`.",
      content: { "application/json": { schema: ListFlowsResponseSchema } },
    },
  },
})

export const listAllFlows = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const flows = await muleta.queues.getAllFlows()
    return c.json({ flows }, 200)
  },
})
