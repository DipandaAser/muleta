import { type Job, type JobsOptions, Queue } from "bullmq"
import type { Redis } from "ioredis"
import {
  type AddJobOptions,
  type GetJobsResult,
  InvalidJobStateError,
  type JobDetail,
  type JobInfo,
  JobNotFoundError,
  type JobState,
  type KeepJobs,
  type QueueConfig,
  type QueueCounts,
  type QueueInfo,
  type QueueRegistry,
  type WorkerInfo,
} from "../types.js"
import { createJobNameIndex } from "./jobNameIndex.js"

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
 * States we scan when refreshing the job-name index. Skipped: `paused`
 * (per-queue flag, doesn't have a dedicated job list) and `waiting-children`
 * (rare, expensive to enumerate via `getJobs`).
 */
const NAME_INDEX_STATES: JobState[] = [
  "completed",
  "failed",
  "active",
  "delayed",
  "waiting",
  "prioritized",
]

/** Cap per queue per refresh — bounds Redis cost on huge queues. */
const NAME_INDEX_SCAN_LIMIT = 200

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
  const jobNames = createJobNameIndex()

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

    async addJob(name, jobName, data, opts) {
      const { queue } = getOrCreate(name)
      const job = await queue.add(jobName, data ?? {}, toBullJobsOptions(opts))
      jobNames.record(jobName)
      return jobToInfo(job)
    },

    getJobNames() {
      return jobNames.list()
    },

    async refreshJobNames() {
      // Walk every registered queue and fold the latest names into the index.
      // Sequential rather than parallel: keeps Redis from being hit with N
      // simultaneous getJobs calls when a deployment has lots of queues.
      for (const name of configs.keys()) {
        try {
          const { queue } = getOrCreate(name)
          const jobs = await queue.getJobs(NAME_INDEX_STATES, 0, NAME_INDEX_SCAN_LIMIT - 1, false)
          for (const job of jobs) {
            if (job?.name) jobNames.record(job.name)
          }
        } catch (err) {
          // A single bad queue shouldn't prevent the rest from refreshing —
          // log and move on.
          console.error(`[muleta] refreshJobNames failed for "${name}":`, err)
        }
      }
    },

    async getWorkers() {
      const out: WorkerInfo[] = []
      for (const name of configs.keys()) {
        try {
          const { queue } = getOrCreate(name)
          const clients = await queue.getWorkers()
          for (const c of clients) {
            const entry = parseClientEntry(c, name)
            if (entry) out.push(entry)
          }
        } catch (err) {
          console.error(`[muleta] getWorkers failed for "${name}":`, err)
        }
      }
      return out
    },

    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()))
      queues.clear()
      configs.clear()
      sources.clear()
      jobNames.clear()
    },
  }
}

/**
 * Translate the muleta-flavoured `AddJobOptions` into BullMQ's `JobsOptions`.
 * Keeps the public core API stable even if BullMQ's option shape drifts.
 */
function toBullJobsOptions(opts: AddJobOptions | undefined): JobsOptions | undefined {
  if (!opts) return undefined
  const out: JobsOptions = {}
  if (opts.jobId !== undefined) out.jobId = opts.jobId
  if (opts.priority !== undefined) out.priority = opts.priority
  if (opts.attempts !== undefined) out.attempts = opts.attempts
  if (opts.delay !== undefined) out.delay = opts.delay
  if (opts.backoff !== undefined) out.backoff = opts.backoff
  if (opts.removeOnComplete !== undefined) {
    out.removeOnComplete = toBullKeepJobs(opts.removeOnComplete)
  }
  if (opts.removeOnFail !== undefined) {
    out.removeOnFail = toBullKeepJobs(opts.removeOnFail)
  }
  if (opts.repeat !== undefined) {
    // BullMQ's `RepeatOptions` is mutually-exclusive between `pattern`
    // and `every` — building the object with only the fields the caller
    // actually set keeps both BullMQ and the schema validator happy.
    // `startDate` / `endDate` come over the wire as ISO strings; convert
    // here because BullMQ stores them via `Date.parse(...)` and we want
    // any failure to surface at registry boundary instead of inside
    // BullMQ's job-scheduler.
    out.repeat = {
      ...(opts.repeat.pattern !== undefined ? { pattern: opts.repeat.pattern } : {}),
      ...(opts.repeat.every !== undefined ? { every: opts.repeat.every } : {}),
      ...(opts.repeat.tz !== undefined ? { tz: opts.repeat.tz } : {}),
      ...(opts.repeat.limit !== undefined ? { limit: opts.repeat.limit } : {}),
      ...(opts.repeat.immediately !== undefined ? { immediately: opts.repeat.immediately } : {}),
      ...(opts.repeat.startDate !== undefined
        ? { startDate: new Date(opts.repeat.startDate) }
        : {}),
      ...(opts.repeat.endDate !== undefined ? { endDate: new Date(opts.repeat.endDate) } : {}),
    }
  }
  return out
}

/**
 * Translate muleta's loose `KeepJobs` shape into BullMQ's strict
 * discriminated union. BullMQ accepts:
 *   - `boolean | number`                                 (passes through)
 *   - `{ count: number }`                                (count required)
 *   - `{ age: number; count?: number; limit?: number }`  (age required)
 *
 * Our public type allows `count` and `age` to both be optional on the
 * object form because that's what the server's zod schema parses to,
 * and what the dashboard form naturally produces. We normalise here so
 * BullMQ never sees an empty object — if the caller hands us
 * `{ count: undefined, age: undefined }`, we collapse it to `true`
 * (remove every job) which is the sensible "they meant *something*"
 * default.
 */
function toBullKeepJobs(v: KeepJobs): NonNullable<JobsOptions["removeOnComplete"]> {
  if (typeof v === "boolean" || typeof v === "number") return v
  if (v.age !== undefined) {
    return v.count !== undefined ? { age: v.age, count: v.count } : { age: v.age }
  }
  if (v.count !== undefined) return { count: v.count }
  return true
}

/**
 * Strip BullMQ's `<prefix>:<queue>` framing from the Redis client name so
 * the UI can display whatever the worker chose to call itself. BullMQ
 * sets the client name as `<prefix>:<queue>` for unnamed workers and
 * `<prefix>:<queue>:w:<userName>` when the consumer passes
 * `new Worker(queue, fn, { name })`.
 *
 * Returns `null` for the unnamed form so the UI can render it as
 * "anonymous" rather than echoing the prefix back.
 *
 * Exported for direct unit-testing — `getWorkers` is the only intended
 * runtime caller.
 */
export function parseWorkerName(clientName: string): string | null {
  const match = /^[^:]+:[^:]+:w:(.+)$/.exec(clientName)
  return match ? match[1]! : null
}

/**
 * Translate a single parsed-CLIENT-LIST entry from BullMQ into the
 * `WorkerInfo` the rest of the stack consumes. Handles two BullMQ
 * quirks in one place so `getWorkers` doesn't repeat them:
 *
 *   1. `parseClientList` rewrites `c.name` to the queue name and stores
 *      the original Redis client name under `c.rawname`.
 *   2. BullMQ falls back to `[{ name: "GCP does not support…" }]` on
 *      Redis hosts that block CLIENT LIST — we drop those rows here.
 *
 * Returns `null` for entries we can't make sense of so the caller can
 * filter cleanly.
 *
 * The cast to `Record<string, string>` is the one unsafe boundary
 * between BullMQ's loosely-typed return and our `WorkerInfo` —
 * containing it here keeps the rest of `getWorkers` typed.
 */
function parseClientEntry(
  client: { [index: string]: string },
  queueName: string,
): WorkerInfo | null {
  if (client.name?.includes("does not support")) return null
  return {
    id: client.id ?? "",
    name: parseWorkerName(client.rawname ?? ""),
    queue: queueName,
    addr: client.addr ?? "",
    ageSeconds: Number(client.age ?? 0),
    idleSeconds: Number(client.idle ?? 0),
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
