import type { RegistryState } from "./state.js"
import type { QueueCounts, QueueInfo, QueueRegistry } from "./types.js"

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

/**
 * Build the canonical `QueueInfo` for a registered queue. Reused by
 * `list()` (one per config) and `get()` (single lookup).
 */
async function buildInfo(state: RegistryState, name: string): Promise<QueueInfo> {
  const { queue, cfg } = state.getOrCreate(name)
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
  return {
    name,
    displayName: cfg.displayName ?? name,
    counts,
    isPaused,
    ...(cfg.prefix !== undefined ? { prefix: cfg.prefix } : {}),
  }
}

/** register/has/list/get + pause/resume + the registry-wide `close()` lifecycle pair. */
export function createLifecycleOps(state: RegistryState): Pick<
  QueueRegistry,
  "register" | "has" | "list" | "get" | "pauseQueue" | "resumeQueue"
> & {
  close(): Promise<void>
} {
  return {
    register(config) {
      const existing = state.sources.get(config.name)
      if (existing === "explicit") {
        throw new Error(`Queue "${config.name}" is already registered`)
      }
      // Upgrading a discovered registration to explicit keeps the existing
      // Queue instance (prefix is identical) and just replaces the config.
      state.registerInternal(config, "explicit")
    },

    has(name) {
      return state.configs.has(name)
    },

    async list() {
      const infos: QueueInfo[] = []
      for (const name of state.configs.keys()) infos.push(await buildInfo(state, name))
      return infos
    },

    get(name) {
      return buildInfo(state, name)
    },

    async pauseQueue(name) {
      const { queue } = state.getOrCreate(name)
      await queue.pause()
    },

    async resumeQueue(name) {
      const { queue } = state.getOrCreate(name)
      await queue.resume()
    },

    async close() {
      await Promise.all([...state.queues.values()].map((q) => q.close()))
      state.queues.clear()
      state.configs.clear()
      state.sources.clear()
      state.jobNames.clear()
    },
  }
}
