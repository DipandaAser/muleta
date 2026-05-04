import { Redis } from "ioredis"
import { createQueues, ensureSchedulers, startFlowLoop, startProducer } from "./seeder.js"
import { startWorkers } from "./workers.js"

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379"
const PRODUCE_INTERVAL_MS = Number(process.env.DEMO_PRODUCE_INTERVAL_MS ?? 600)
const FLOW_INTERVAL_MS = Number(process.env.DEMO_FLOW_INTERVAL_MS ?? 120_000)

console.log("[demo] starting muleta demo seeder + workers")
console.log(`[demo] redis: ${REDIS_URL}`)

// BullMQ requires `maxRetriesPerRequest: null` so blocking commands
// (BLPOP etc.) don't time out and force restart loops.
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null })

connection.on("error", (err) => {
  console.error("[demo] redis error:", err.message)
})

connection.on("connect", () => {
  console.log("[demo] redis connected")
})

const queues = createQueues(connection)
console.log(`[demo] created ${queues.size} queues:`, [...queues.keys()].join(", "))

const workers = startWorkers(connection)
console.log(`[demo] started ${workers.length} workers`)

await ensureSchedulers(queues)
console.log("[demo] schedulers registered")

const stopProducer = startProducer(queues, { intervalMs: PRODUCE_INTERVAL_MS })
console.log(`[demo] producer running every ${PRODUCE_INTERVAL_MS}ms`)

const stopFlowLoop = startFlowLoop(connection, { intervalMs: FLOW_INTERVAL_MS })
console.log(`[demo] flow loop running every ${FLOW_INTERVAL_MS}ms`)

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[demo] received ${signal}, shutting down…`)
  stopProducer()
  stopFlowLoop()
  await Promise.allSettled([
    ...workers.map((w) => w.close()),
    ...[...queues.values()].map((q) => q.close()),
  ])
  await connection.quit().catch(() => {})
  console.log("[demo] bye")
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
