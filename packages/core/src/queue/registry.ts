import { type Job, Queue } from "bullmq"
import type { Redis } from "ioredis"
import type {
  GetJobsResult,
  JobInfo,
  JobState,
  QueueConfig,
  QueueCounts,
  QueueInfo,
  QueueRegistry,
} from "../types.js"

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

async function jobToInfo(job: Job): Promise<JobInfo> {
  // Multi-state queries mix jobs from several lists, so the authoritative
  // state has to come from Redis. Cheap per-job lookup but N+1 over the page.
  const state = (await job.getState()) as JobState
  return {
    id: String(job.id),
    name: job.name,
    state,
    data: job.data,
    progress: job.progress ?? 0,
    attemptsMade: job.attemptsMade,
    // BullMQ stores unset attempts as 0; treat both 0 and undefined as the default of 1.
    attempts: job.opts.attempts || 1,
    addedAt: job.timestamp,
    ...(job.failedReason !== undefined ? { failedReason: job.failedReason } : {}),
    ...(job.processedOn !== undefined ? { processedAt: job.processedOn } : {}),
    ...(job.finishedOn !== undefined ? { finishedAt: job.finishedOn } : {}),
  }
}

export function createQueueRegistry(redis: Redis): InternalQueueRegistry {
  const configs = new Map<string, QueueConfig>()
  const queues = new Map<string, Queue>()

  function getOrCreate(name: string): { queue: Queue; cfg: QueueConfig } {
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
  }

  async function buildInfo(name: string): Promise<QueueInfo> {
    const { queue, cfg } = getOrCreate(name)
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
      for (const name of configs.keys()) infos.push(await buildInfo(name))
      return infos
    },

    get(name) {
      return buildInfo(name)
    },

    async getJobs(name, opts) {
      const { queue } = getOrCreate(name)
      const start = opts.start ?? 0
      const end = opts.end ?? start + 19
      const asc = opts.asc ?? false

      const [rawJobs, counts] = await Promise.all([
        queue.getJobs(opts.states, start, end, asc),
        queue.getJobCounts(...opts.states),
      ])

      const jobs = await Promise.all(
        rawJobs.filter((j): j is Job => j !== undefined).map(jobToInfo),
      )
      const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)

      return { jobs, total } satisfies GetJobsResult
    },

    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()))
      queues.clear()
      configs.clear()
    },
  }
}
