import { createQueueRegistry } from "./queue/registry.js"
import { createRedis } from "./redis.js"
import type { Muleta, MuletaOptions } from "./types.js"

export async function createMuleta(opts: MuletaOptions): Promise<Muleta> {
  const redis = createRedis(opts.redis)
  const registry = createQueueRegistry(redis)

  for (const cfg of opts.queues ?? []) {
    registry.register(cfg)
  }

  return {
    queues: registry,
    async close() {
      await registry.close()
      await redis.quit()
    },
  }
}
