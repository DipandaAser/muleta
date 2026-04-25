import { existsSync } from "node:fs"
import { serve } from "@hono/node-server"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { buildPath as uiBuildPath } from "@muleta-dev/ui/server"

const PORT = 3737

function die(message: string): never {
  console.error(`[muleta] ${message}`)
  process.exit(1)
}

async function main() {
  const redisUrl = process.env.MULETA_REDIS_URL
  if (!redisUrl) die("MULETA_REDIS_URL is required")

  const muleta = await createMuleta({ redis: { url: redisUrl } })

  const assets = existsSync(uiBuildPath) ? { path: uiBuildPath } : undefined
  if (!assets) die(`UI assets not found at ${uiBuildPath}`)

  const app = createHandler({
    endpoints: createEndpoints(muleta),
    ...(assets ? { assets } : {}),
  })

  const server = serve({ fetch: app.fetch, port: PORT }, async (info) => {
    console.log(`[muleta] ready on http://localhost:${info.port}`)
    const found = await muleta.queues.list()
    if (found.length > 0) {
      console.log(
        `[muleta] discovered ${found.length} queue(s): ${found.map((q) => q.name).join(", ")}`,
      )
    } else {
      console.log("[muleta] no queues found yet (discovery re-runs every 15s)")
    }
  })

  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true

    console.log(`[muleta] ${signal} received, shutting down`)
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
      await muleta.close()
      process.exit(0)
    } catch (err) {
      console.error("[muleta] shutdown error:", err)
      process.exit(1)
    }
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((err) => {
  console.error("[muleta] startup failed:", err)
  process.exit(1)
})
