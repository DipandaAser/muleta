import { serve } from "@hono/node-server"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { Hono } from "hono"

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379"
const PORT = Number(process.env.PORT ?? 3000)
const MOUNT = "/admin/queues"

const muleta = await createMuleta({ redis: { url: REDIS_URL } })

const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
})

const app = new Hono()

// The dashboard ships unauthenticated. Wrap the mount with your own
// admin auth middleware before going to production. e.g.:
//
//   app.use(`${MOUNT}/*`, async (c, next) => {
//     const user = await authenticate(c.req.raw)
//     if (!user?.isAdmin) return c.text("forbidden", 403)
//     await next()
//   })
app.route(MOUNT, dashboard)

app.get("/", (c) => c.text(`muleta embed example — see ${MOUNT}\n`))

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[example] listening on http://localhost:${info.port}${MOUNT}`)
})
