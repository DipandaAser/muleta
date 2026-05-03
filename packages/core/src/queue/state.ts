import { Queue } from "bullmq"
import type { Redis } from "ioredis"
import { createJobNameIndex } from "./jobNameIndex.js"
import type { QueueConfig } from "./types.js"

/** Whether a queue config came from the caller or from prefix discovery. */
export type Source = "explicit" | "discovered"

/**
 * Mutable state shared by every operation module. The factory wires up
 * the maps, the lazy `Queue` cache, and the job-name index, then exposes
 * the primitive helpers (`getOrCreate`, `closeQueue`, `registerInternal`)
 * that operation modules use without each one re-implementing the
 * registered/lazy-create dance.
 */
export interface RegistryState {
  readonly redis: Redis
  readonly configs: Map<string, QueueConfig>
  readonly sources: Map<string, Source>
  readonly queues: Map<string, Queue>
  readonly jobNames: ReturnType<typeof createJobNameIndex>
  /** Lazily build (and cache) a BullMQ `Queue` for a registered config. Throws if `name` isn't registered. */
  getOrCreate(name: string): { queue: Queue; cfg: QueueConfig }
  /** Disconnect and drop a cached `Queue` instance, no-op if not cached. */
  closeQueue(name: string): Promise<void>
  /** Replace or insert a config under `name` and tag it with its source. */
  registerInternal(config: QueueConfig, source: Source): void
}

export function createRegistryState(redis: Redis): RegistryState {
  const configs = new Map<string, QueueConfig>()
  const sources = new Map<string, Source>()
  const queues = new Map<string, Queue>()
  const jobNames = createJobNameIndex()

  const state: RegistryState = {
    redis,
    configs,
    sources,
    queues,
    jobNames,
    getOrCreate(name) {
      const cfg = configs.get(name)
      if (!cfg) throw new Error(`Queue "${name}" is not registered`)
      let queue = queues.get(name)
      if (!queue) {
        queue = new Queue(cfg.name, {
          connection: redis,
          ...(cfg.prefix !== undefined ? { prefix: cfg.prefix } : {}),
        })
        queues.set(name, queue)
      }
      return { queue, cfg }
    },
    async closeQueue(name) {
      const q = queues.get(name)
      if (q) {
        queues.delete(name)
        await q.close()
      }
    },
    registerInternal(config, source) {
      configs.set(config.name, { ...config })
      sources.set(config.name, source)
    },
  }
  return state
}
