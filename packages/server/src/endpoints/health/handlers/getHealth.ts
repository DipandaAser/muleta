import { createRoute } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"
import { HealthStatusSchema } from "../schemas.js"

export const route = createRoute({
  method: "get",
  path: "/",
  tags: ["Health"],
  responses: {
    200: {
      description: "Current health snapshot (Redis reachability + server uptime).",
      content: { "application/json": { schema: HealthStatusSchema } },
    },
  },
})

export const getHealth = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const health = await muleta.health()
    return c.json(health, 200)
  },
})
