import { createRoute } from "@hono/zod-openapi"
import { defineEndpoint } from "../../define.js"
import { JobNamesResponseSchema } from "../../queues/jobs/schema.js"

export const route = createRoute({
  method: "get",
  path: "/names",
  tags: ["Jobs"],
  responses: {
    200: {
      description:
        "Every distinct job name muleta has observed across every registered queue. Used by the Add-job picker.",
      content: { "application/json": { schema: JobNamesResponseSchema } },
    },
  },
})

/**
 * Backed by the in-memory `JobNameIndex`. Lazily refreshes on first read so
 * the dashboard doesn't get an empty list racing against the periodic
 * discover loop on a fresh muleta start.
 */
export const getJobNames = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    let names = muleta.queues.getJobNames()
    if (names.length === 0) {
      await muleta.queues.refreshJobNames()
      names = muleta.queues.getJobNames()
    }
    return c.json({ names }, 200)
  },
})
