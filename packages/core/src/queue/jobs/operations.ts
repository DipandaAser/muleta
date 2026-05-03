import type { Job, JobsOptions } from "bullmq"
import type { RegistryState } from "../state.js"
import type { QueueRegistry } from "../types.js"
import { InvalidJobStateError, JobNotFoundError } from "./errors.js"
import type { AddJobOptions, JobDetail, JobInfo, JobState, KeepJobs } from "./types.js"

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

export function createJobOps(
  state: RegistryState,
): Pick<
  QueueRegistry,
  | "getJobs"
  | "getJob"
  | "retryJob"
  | "removeJob"
  | "promoteJob"
  | "addJob"
  | "getJobNames"
  | "refreshJobNames"
> {
  async function requireJob(name: string, id: string): Promise<Job> {
    const { queue } = state.getOrCreate(name)
    const job = await queue.getJob(id)
    if (!job) throw new JobNotFoundError(name, id)
    return job
  }

  return {
    async getJobs(name, opts) {
      const { queue } = state.getOrCreate(name)
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

      return { jobs, total }
    },

    async getJob(name, id) {
      const { queue } = state.getOrCreate(name)
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
      const jobState = (await job.getState()) as JobState
      if (jobState !== "failed") {
        throw new InvalidJobStateError("retry", jobState, ["failed"])
      }
      await job.retry()
    },

    async removeJob(name, id) {
      const job = await requireJob(name, id)
      await job.remove()
    },

    async promoteJob(name, id) {
      const job = await requireJob(name, id)
      const jobState = (await job.getState()) as JobState
      if (jobState !== "delayed") {
        throw new InvalidJobStateError("promote", jobState, ["delayed"])
      }
      await job.promote()
    },

    async addJob(name, jobName, data, opts) {
      const { queue } = state.getOrCreate(name)
      const job = await queue.add(jobName, data ?? {}, toBullJobsOptions(opts))
      state.jobNames.record(jobName)
      return jobToInfo(job)
    },

    getJobNames() {
      return state.jobNames.list()
    },

    async refreshJobNames() {
      // Walk every registered queue and fold the latest names into the index.
      // Sequential rather than parallel: keeps Redis from being hit with N
      // simultaneous getJobs calls when a deployment has lots of queues.
      for (const name of state.configs.keys()) {
        try {
          const { queue } = state.getOrCreate(name)
          const jobs = await queue.getJobs(NAME_INDEX_STATES, 0, NAME_INDEX_SCAN_LIMIT - 1, false)
          for (const job of jobs) {
            if (job?.name) state.jobNames.record(job.name)
          }
        } catch (err) {
          // A single bad queue shouldn't prevent the rest from refreshing —
          // log and move on.
          console.error(`[muleta] refreshJobNames failed for "${name}":`, err)
        }
      }
    },
  }
}
