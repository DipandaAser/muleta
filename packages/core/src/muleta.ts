import { createHealthProbe } from "./health.js"
import { createQueueRegistry, DEFAULT_BULLMQ_PREFIX } from "./queue/registry.js"
import { createRedis } from "./redis.js"
import type { Muleta, MuletaOptions } from "./types.js"

const DISCOVERY_INTERVAL_MS = 15_000

export async function createMuleta(opts: MuletaOptions): Promise<Muleta> {
  const startedAt = Date.now()
  const redis = createRedis(opts.redis)
  const registry = createQueueRegistry(redis)

  for (const cfg of opts.queues ?? []) {
    registry.register(cfg)
  }

  // Scan the default prefix plus any non-default prefix pulled from explicit
  // registrations — so a caller that configured `prefix: "myapp"` gets those
  // queues discovered too without extra wiring.
  const prefixes = new Set<string>([DEFAULT_BULLMQ_PREFIX])
  for (const cfg of opts.queues ?? []) {
    if (cfg.prefix) prefixes.add(cfg.prefix)
  }
  const prefixList = [...prefixes]

  await registry.discover(prefixList)

  let closed = false
  const timer = setInterval(() => {
    if (closed) return
    registry.discover(prefixList).catch((err) => {
      console.error("[muleta] queue discovery failed:", err)
    })
  }, DISCOVERY_INTERVAL_MS)
  timer.unref()

  const health = createHealthProbe(redis, startedAt)

  return {
    queues: registry,
    health,
    async close() {
      closed = true
      clearInterval(timer)
      await registry.close()
      await redis.quit()
    },
  }
}
