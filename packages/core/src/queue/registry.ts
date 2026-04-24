import { type Job, Queue } from "bullmq"
import type { Redis } from "ioredis"
import {
  type GetJobsResult,
  InvalidJobStateError,
  type JobDetail,
  type JobInfo,
  JobNotFoundError,
  type JobState,
  type QueueConfig,
  type QueueCounts,
  type QueueInfo,
  type QueueRegistry,
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
  /**
   * Scan Redis for BullMQ queues under the given prefixes and reconcile the
   * registry. Queues whose `<prefix>:<name>:meta` hash is present are
   * registered as "discovered"; previously-discovered queues absent from the
   * current pass are unregistered and their Queue instances closed. Explicit
   * registrations are never evicted. Returns the names of all registered
   * queues (explicit + discovered) after the pass.
   */
  discover(prefixes: string[]): Promise<string[]>
  close(): Promise<void>
}

/** BullMQ's default key prefix. */
export const DEFAULT_BULLMQ_PREFIX = "bull"

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

type Source = "explicit" | "discovered"

export function createQueueRegistry(redis: Redis): InternalQueueRegistry {
  const configs = new Map<string, QueueConfig>()
  const sources = new Map<string, Source>()
  const queues = new Map<string, Queue>()

  async function closeQueue(name: string): Promise<void> {
    const q = queues.get(name)
    if (q) {
      queues.delete(name)
      await q.close()
    }
  }

  function registerInternal(config: QueueConfig, source: Source): void {
    configs.set(config.name, { ...config })
    sources.set(config.name, source)
  }

  async function requireJob(name: string, id: string): Promise<Job> {
    const { queue } = getOrCreate(name)
    const job = await queue.getJob(id)
    if (!job) throw new JobNotFoundError(name, id)
    return job
  }

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
      const existing = sources.get(config.name)
      if (existing === "explicit") {
        throw new Error(`Queue "${config.name}" is already registered`)
      }
      // Upgrading a discovered registration to explicit keeps the existing
      // Queue instance (prefix is identical) and just replaces the config.
      registerInternal(config, "explicit")
    },

    async discover(prefixes) {
      const seen = new Set<string>()
      const uniquePrefixes = Array.from(new Set(prefixes))

      for (const prefix of uniquePrefixes) {
        await scanPrefix(redis, prefix, (name) => {
          seen.add(name)
          if (!configs.has(name)) {
            registerInternal(
              { name, ...(prefix !== DEFAULT_BULLMQ_PREFIX ? { prefix } : {}) },
              "discovered",
            )
          }
        })
      }

      // Evict discovered queues that no longer exist in Redis.
      const toEvict: string[] = []
      for (const [name, source] of sources) {
        if (source === "discovered" && !seen.has(name)) toEvict.push(name)
      }
      for (const name of toEvict) {
        configs.delete(name)
        sources.delete(name)
        await closeQueue(name)
      }

      return [...configs.keys()]
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

    async getJob(name, id) {
      const { queue } = getOrCreate(name)
      const job = await queue.getJob(id)
      if (!job) return null
      const info = await jobToInfo(job)
      // BullMQ returns the log list already ordered oldest→newest; keep that.
      const { logs } = await queue.getJobLogs(id, 0, -1, true)
      return {
        ...info,
        returnvalue: job.returnvalue,
        stacktrace: job.stacktrace ?? [],
        delay: job.opts.delay ?? 0,
        priority: job.opts.priority ?? 0,
        opts: { ...job.opts } as Record<string, unknown>,
        logs,
      } satisfies JobDetail
    },

    async retryJob(name, id) {
      const job = await requireJob(name, id)
      const state = (await job.getState()) as JobState
      if (state !== "failed") {
        throw new InvalidJobStateError("retry", state, ["failed"])
      }
      await job.retry()
    },

    async removeJob(name, id) {
      const job = await requireJob(name, id)
      await job.remove()
    },

    async promoteJob(name, id) {
      const job = await requireJob(name, id)
      const state = (await job.getState()) as JobState
      if (state !== "delayed") {
        throw new InvalidJobStateError("promote", state, ["delayed"])
      }
      await job.promote()
    },

    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()))
      queues.clear()
      configs.clear()
      sources.clear()
    },
  }
}

/**
 * SCAN Redis for `<prefix>:*:meta` keys and invoke `onFound` for each
 * discovered queue name. Uses cursor iteration so the event loop isn't
 * blocked on large keyspaces.
 */
async function scanPrefix(
  redis: Redis,
  prefix: string,
  onFound: (queueName: string) => void,
): Promise<void> {
  const pattern = `${prefix}:*:meta`
  const prefixLen = prefix.length + 1 // account for the trailing ':'
  const metaSuffixLen = ":meta".length
  let cursor = "0"
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200)
    for (const key of keys) {
      const name = key.slice(prefixLen, key.length - metaSuffixLen)
      if (name.length > 0) onFound(name)
    }
    cursor = next
  } while (cursor !== "0")
}
