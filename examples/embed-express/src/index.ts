import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToExpress } from "@muleta-dev/server/express"
import express from "express"

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379"
const PORT = Number(process.env.PORT ?? 3000)
const MOUNT = "/admin/queues"

const muleta = await createMuleta({ redis: { url: REDIS_URL } })

const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  // Express strips the matched mount prefix from `req.url` before
  // invoking middleware, so we pin the mount path here so the SPA's
  // API client still targets `/admin/queues/api/v1/*` after navigation.
  basePath: MOUNT,
})

const app = express()

// Replace with your real admin auth — the dashboard ships unauthenticated.
app.use(MOUNT, (_req, _res, next) => {
  // if (!req.user?.isAdmin) return res.status(403).end()
  next()
})

app.use(MOUNT, honoToExpress(dashboard))

app.get("/", (_req, res) => res.type("text/plain").send(`muleta embed example — see ${MOUNT}\n`))

app.listen(PORT, () => {
  console.log(`[example] listening on http://localhost:${PORT}${MOUNT}`)
})
