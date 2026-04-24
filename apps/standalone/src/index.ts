import { existsSync } from "node:fs"
import { serve } from "@hono/node-server"
import { createMuleta } from "@muleta/core"
import { createEndpoints, createHandler } from "@muleta/server"
import { buildPath as uiBuildPath } from "@muleta/ui/server"

function die(message: string): never {
  console.error(`[muleta] ${message}`)
  process.exit(1)
}

async function main() {
  const redisUrl = process.env.MULETA_REDIS_URL
  if (!redisUrl) die("MULETA_REDIS_URL is required")

  const port = Number(process.env.MULETA_PORT ?? 3737)
  if (!Number.isInteger(port) || port <= 0) {
    die(`invalid MULETA_PORT: ${process.env.MULETA_PORT}`)
  }

  const muleta = await createMuleta({ redis: { url: redisUrl } })

  const assets = existsSync(uiBuildPath) ? { path: uiBuildPath } : undefined
  if (!assets) {
    console.log("[muleta] UI build not found (run `pnpm -F @muleta/ui build`); serving API only.")
  }

  const app = createHandler({
    endpoints: createEndpoints(muleta),
    ...(assets ? { assets } : {}),
  })

  const server = serve({ fetch: app.fetch, port }, async (info) => {
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
