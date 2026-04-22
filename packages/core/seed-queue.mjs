import { Queue } from "bullmq"
import { Redis } from "ioredis"

const name = process.argv[2] ?? "notifications"
const connection = new Redis("redis://localhost:6379", { maxRetriesPerRequest: null })
const queue = new Queue(name, { connection })

await queue.waitUntilReady()
await queue.add("welcome", { user: "claude", at: Date.now() })
await queue.add("digest", { freq: "daily" }, { delay: 60_000 })
await queue.add("retry-me", { attempt: 1 })

console.log(`seeded queue "${name}" with 3 jobs`)

await queue.close()
connection.disconnect()
