import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { Muleta } from "@muleta/core"
import { streamSSE } from "hono/streaming"
import { HealthStatusSchema } from "../schemas.js"

export const getHealthRoute = createRoute({
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

/**
 * SSE stream — emits one `health` event per poll interval. The stream is
 * infinite until the client disconnects; `stream.onAbort` breaks the loop
 * so we stop polling Redis as soon as the EventSource goes away.
 *
 * `event: health` frames themselves double as proxy keep-alives (we poll
 * every couple seconds by default, well under any reverse-proxy idle
 * timeout), so no separate comment heartbeat is needed.
 */
export const healthEventsRoute = createRoute({
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

const MIN_INTERVAL_MS = 500

export function createHealthApp(muleta: Muleta) {
  return new OpenAPIHono()
    .openapi(getHealthRoute, async (c) => {
      const health = await muleta.health()
      return c.json(health, 200)
    })
    .openapi(healthEventsRoute, (c) => {
      const { interval } = c.req.valid("query")
      const pollMs = Math.max(MIN_INTERVAL_MS, interval)

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
          await stream.sleep(pollMs)
        }
      })
    })
}
