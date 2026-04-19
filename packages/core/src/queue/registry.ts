import { Queue } from "bullmq"
import type { Redis } from "ioredis"
import type { QueueConfig, QueueCounts, QueueInfo, QueueRegistry } from "../types.js"

const COUNTED_STATES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "prioritized",
  "waiting-children",
] as const

export interface InternalQueueRegistry extends QueueRegistry {
  close(): Promise<void>
}

export function createQueueRegistry(redis: Redis): InternalQueueRegistry {
  const configs = new Map<string, QueueConfig>()
  const queues = new Map<string, Queue>()

  return {
    register(config) {
      if (configs.has(config.name)) {
        throw new Error(`Queue "${config.name}" is already registered`)
      }
      configs.set(config.name, { ...config })
    },

    has(name) {
      return configs.has(name)
    },

    async list() {
      const infos: QueueInfo[] = []
      for (const [name, cfg] of configs) {
        let queue = queues.get(name)
        if (!queue) {
          queue = new Queue(cfg.name, {
            connection: redis,
            ...(cfg.prefix !== undefined ? { prefix: cfg.prefix } : {}),
          })
          queues.set(name, queue)
        }

        const [rawCounts, isPaused] = await Promise.all([
          queue.getJobCounts(...COUNTED_STATES),
          queue.isPaused(),
        ])

        const counts: QueueCounts = {
          waiting: rawCounts.waiting ?? 0,
          active: rawCounts.active ?? 0,
          completed: rawCounts.completed ?? 0,
          failed: rawCounts.failed ?? 0,
          delayed: rawCounts.delayed ?? 0,
          paused: rawCounts.paused ?? 0,
          prioritized: rawCounts.prioritized ?? 0,
          "waiting-children": rawCounts["waiting-children"] ?? 0,
        }

        infos.push({
          name,
          displayName: cfg.displayName ?? name,
          counts,
          isPaused,
          ...(cfg.prefix !== undefined ? { prefix: cfg.prefix } : {}),
        })
      }
      return infos
    },

    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()))
      queues.clear()
      configs.clear()
    },
  }
}
