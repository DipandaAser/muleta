import { createRoute, z } from "@hono/zod-openapi"
import { streamSSE } from "hono/streaming"
import { defineEndpoint } from "../../define.js"

export const route = createRoute({
  method: "get",
  path: "/events",
  tags: ["Health"],
  request: {
    query: z.object({
      interval: z.coerce.number().int().min(500).max(60_000).optional().default(2000),
    }),
  },
  responses: {
    200: {
      description: "Server-Sent Events stream of health snapshots.",
      content: { "text/event-stream": { schema: z.string() } },
    },
  },
})

/**
 * SSE stream — emits one `health` event per poll interval. The stream is
 * infinite until the client disconnects; `stream.onAbort` breaks the loop
 * so we stop polling Redis as soon as the EventSource goes away.
 */
export const healthEvents = defineEndpoint({
  route,
  handler: (muleta) => (c) => {
    const { interval } = c.req.valid("query")

    return streamSSE(c, async (stream) => {
      let stopped = false
      stream.onAbort(() => {
        stopped = true
      })

      while (!stopped && !stream.aborted) {
        const health = await muleta.health()
        await stream.writeSSE({
          event: "health",
          data: JSON.stringify(health),
          id: String(health.timestamp),
        })
        if (stopped || stream.aborted) break
        await stream.sleep(interval)
      }
    })
  },
})
