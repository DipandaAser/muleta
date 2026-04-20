import { existsSync } from "node:fs"
import { serve } from "@hono/node-server"
import { createMuleta, type QueueConfig } from "@muleta/core"
import { createEndpoints, createHandler } from "@muleta/server"
import { buildPath as uiBuildPath } from "@muleta/ui/server"

function die(message: string): never {
  console.error(`[muleta] ${message}`)
  process.exit(1)
}

function parseQueues(raw: string | undefined): QueueConfig[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((name) => ({ name }))
}

async function main() {
  const redisUrl = process.env.MULETA_REDIS_URL
  if (!redisUrl) die("MULETA_REDIS_URL is required")

  const port = Number(process.env.MULETA_PORT ?? 3737)
  if (!Number.isInteger(port) || port <= 0) {
    die(`invalid MULETA_PORT: ${process.env.MULETA_PORT}`)
  }

  const queues = parseQueues(process.env.MULETA_QUEUES)

  const muleta = await createMuleta({ redis: { url: redisUrl }, queues })

  const assets = existsSync(uiBuildPath) ? { path: uiBuildPath } : undefined
  if (!assets) {
    console.log("[muleta] UI build not found (run `pnpm -F @muleta/ui build`); serving API only.")
  }

  const app = createHandler({
    endpoints: createEndpoints(muleta),
    ...(assets ? { assets } : {}),
  })

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[muleta] ready on http://localhost:${info.port}`)
    if (queues.length > 0) {
      console.log(
        `[muleta] watching ${queues.length} queue(s): ${queues.map((q) => q.name).join(", ")}`,
      )
    } else {
      console.log("[muleta] no queues registered (set MULETA_QUEUES to a comma-separated list)")
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
