import { createRoute, z } from "@hono/zod-openapi"
import { streamSSE } from "hono/streaming"
import { defineEndpoint } from "../../define.js"

export const route = createRoute({
  method: "get",
  path: "/events",
  tags: ["Queues"],
  request: {
    query: z.object({
      interval: z.coerce.number().int().min(500).max(60_000).optional().default(2000),
    }),
  },
  responses: {
    200: {
      description: "Server-Sent Events stream of queue list snapshots.",
      content: { "text/event-stream": { schema: z.string() } },
    },
  },
})

/**
 * SSE stream — emits one `queues` event per poll interval with the current
 * list + counts for every registered queue (explicit + autodiscovered).
 * Declared before `/{name}` in the assembler so the literal "events" segment
 * can't be mistaken for a queue name by the router.
 */
export const queuesEvents = defineEndpoint({
  route,
  handler: (muleta) => (c) => {
    const { interval } = c.req.valid("query")

    return streamSSE(c, async (stream) => {
      let stopped = false
      stream.onAbort(() => {
        stopped = true
      })

      while (!stopped && !stream.aborted) {
        const queues = await muleta.queues.list()
        await stream.writeSSE({
          event: "queues",
          data: JSON.stringify({ queues }),
          id: String(Date.now()),
        })
        if (stopped || stream.aborted) break
        await stream.sleep(interval)
      }
    })
  },
})
