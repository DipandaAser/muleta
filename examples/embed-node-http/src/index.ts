import { createServer } from "node:http"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToNode } from "@muleta-dev/server/node"

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379"
const PORT = Number(process.env.PORT ?? 3000)
const MOUNT = "/admin/queues"

const muleta = await createMuleta({ redis: { url: REDIS_URL } })

const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: MOUNT,
})

const server = createServer(async (req, res) => {
  // Anything under MOUNT goes to the dashboard. Add your real auth
  // check here — muleta ships unauthenticated.
  if (req.url?.startsWith(MOUNT)) {
    return honoToNode(dashboard, req, res, { stripPath: MOUNT })
  }

  res.writeHead(200, { "content-type": "text/plain" })
  res.end(`muleta embed example — see ${MOUNT}\n`)
})

server.listen(PORT, () => {
  console.log(`[example] listening on http://localhost:${PORT}${MOUNT}`)
})
