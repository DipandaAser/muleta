import type { JobSchedulerJson } from "bullmq"
import type { RegistryState } from "../state.js"
import type { QueueRegistry } from "../types.js"
import type { JobSchedulerInfo } from "./types.js"

/**
 * Translate BullMQ's `JobSchedulerJson` into the public `JobSchedulerInfo`.
 * BullMQ leaves optional fields off the object entirely (rather than
 * setting them to `undefined`), so we mirror that with conditional
 * spreads to keep `exactOptionalPropertyTypes` happy. The `template`
 * payload is opaque user data — we forward it as-is.
 */
function mapScheduler(s: JobSchedulerJson, queueName: string): JobSchedulerInfo {
  return {
    id: s.key,
    queue: queueName,
    jobName: s.name,
    next: typeof s.next === "number" ? s.next : null,
    ...(s.pattern !== undefined ? { pattern: s.pattern } : {}),
    ...(s.every !== undefined ? { every: s.every } : {}),
    ...(s.tz !== undefined ? { tz: s.tz } : {}),
    ...(s.limit !== undefined ? { limit: s.limit } : {}),
    ...(s.iterationCount !== undefined ? { iterationCount: s.iterationCount } : {}),
    ...(s.startDate !== undefined ? { startDate: s.startDate } : {}),
    ...(s.endDate !== undefined ? { endDate: s.endDate } : {}),
    ...(s.template !== undefined ? { template: s.template } : {}),
  }
}

export function createSchedulerOps(
  state: RegistryState,
): Pick<QueueRegistry, "getJobSchedulers" | "getAllJobSchedulers" | "removeJobScheduler"> {
  return {
    async getJobSchedulers(name) {
      const { queue } = state.getOrCreate(name)
      // BullMQ returns schedulers ordered by next fire time when `asc=true`.
      // -1 as `end` means "all" — Redis ZRANGE convention.
      const raw = await queue.getJobSchedulers(0, -1, true)
      return raw.map((s) => mapScheduler(s, name))
    },

    async removeJobScheduler(name, schedulerId) {
      const { queue } = state.getOrCreate(name)
      return queue.removeJobScheduler(schedulerId)
    },

    async getAllJobSchedulers() {
      const out: JobSchedulerInfo[] = []
      for (const name of state.configs.keys()) {
        try {
          const { queue } = state.getOrCreate(name)
          const raw = await queue.getJobSchedulers(0, -1, true)
          for (const s of raw) out.push(mapScheduler(s, name))
        } catch (err) {
          // One bad queue shouldn't poison the cross-queue view.
          console.error(`[muleta] getAllJobSchedulers failed for "${name}":`, err)
        }
      }
      // BullMQ orders within a single queue; sort the cross-queue
      // result so soonest-firing schedulers float to the top.
      // `next: null` (exhausted) sinks to the bottom.
      out.sort((a, b) => {
        if (a.next === null && b.next === null) return 0
        if (a.next === null) return 1
        if (b.next === null) return -1
        return a.next - b.next
      })
      return out
    },
  }
}
