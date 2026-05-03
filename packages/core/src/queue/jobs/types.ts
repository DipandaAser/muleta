import type { JobType as BullMQJobType } from "bullmq"

export const JOB_STATES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "prioritized",
  "waiting-children",
] as const satisfies readonly BullMQJobType[]

export type JobState = (typeof JOB_STATES)[number]

/** Matches BullMQ's `JobProgress` — a number, percentage object, or custom value. */
export type JobProgress = number | string | boolean | object

export interface JobInfo {
  id: string
  name: string
  state: JobState
  data: unknown
  progress: JobProgress
  attemptsMade: number
  /** Max attempts configured via `opts.attempts` (default 1 in BullMQ). */
  attempts: number
  failedReason?: string
  addedAt: number
  processedAt?: number
  finishedAt?: number
}

/** Full job payload for the detail view — superset of `JobInfo`. */
export interface JobDetail extends JobInfo {
  /** Result of a completed job (job.returnvalue). */
  returnvalue: unknown
  /** Stack trace entries captured across attempts. Empty unless failed. */
  stacktrace: string[]
  /** Scheduled delay in ms (0 if none). */
  delay: number
  /** BullMQ priority — 0 = default, lower = higher priority. */
  priority: number
  /**
   * Raw BullMQ `opts` passed when the job was enqueued. Shape is arbitrary
   * (user-controlled) so we surface it as-is for the UI to render.
   */
  opts: Record<string, unknown>
  /** Job-scoped logs appended via `job.log(...)`. */
  logs: string[]
}

export interface GetJobsOptions {
  states: JobState[]
  /** Inclusive start index into the state's list. Default 0. */
  start?: number
  /** Exclusive end index. Default 19 (i.e. 20-item page). */
  end?: number
  /** ascending timestamp order. Default false (newest first). */
  asc?: boolean
}

export interface GetJobsResult {
  jobs: JobInfo[]
  /** Total jobs in this state for the queue (for pagination). */
  total: number
}

/**
 * Mirrors BullMQ's auto-removal contract — what to keep when a job
 * finishes (or fails). Three forms:
 *   - `true`   → remove every matching job immediately
 *   - `false`  → never remove (BullMQ's silent default)
 *   - number   → keep last N (shorthand for `{ count: N }`)
 *   - object   → cap by recency (`age` in seconds), count, or both. With
 *                both set, BullMQ keeps a job as long as it's within the
 *                last `count` AND younger than `age`.
 *
 * See https://docs.bullmq.io/guide/queues/auto-removal-of-jobs.
 */
export type KeepJobs = boolean | number | { count?: number; age?: number }

/**
 * Subset of BullMQ's `JobsOptions` that muleta exposes on `addJob`. We
 * deliberately don't pass `JobsOptions` through verbatim: BullMQ accepts
 * fields like `parent`, `lifo`, `prevMillis` that don't make sense from a
 * dashboard form, and re-exporting BullMQ types would couple the public
 * core API to BullMQ's release cadence.
 */
export interface AddJobOptions {
  /** Caller-provided job id. BullMQ generates one if omitted. */
  jobId?: string
  /** Lower number = higher priority. 0 (the default) means no priority. */
  priority?: number
  /** Total attempts including the first try. Defaults to 1 in BullMQ. */
  attempts?: number
  /** Delay in milliseconds before the job becomes processable. */
  delay?: number
  backoff?: { type: "fixed" | "exponential"; delay: number }
  /** Auto-removal of completed jobs — see `KeepJobs`. */
  removeOnComplete?: KeepJobs
  /** Auto-removal of failed jobs — see `KeepJobs`. */
  removeOnFail?: KeepJobs
  /**
   * Repeating schedule. Mutually-exclusive strategies:
   *   - `pattern` — cron-style expression (5 or 6 fields)
   *   - `every`   — fixed millisecond interval
   *
   * Plus optional knobs: `tz` (cron only), `limit` (cap on total
   * executions), `immediately` (cron only, fires once on add).
   *
   * BullMQ ignores `jobId` when this field is set — it derives a
   * deterministic id from the schedule.
   *
   * See https://docs.bullmq.io/guide/job-schedulers/repeat-options.
   */
  repeat?: {
    pattern?: string
    every?: number
    tz?: string
    limit?: number
    immediately?: boolean
    /**
     * Schedule bounds — ISO 8601 strings on the wire. BullMQ accepts
     * `Date | string | number` and forwards the value to cron-parser via
     * its inherited `ParserOptions`. Works with both `pattern` and
     * `every` strategies.
     */
    startDate?: string
    endDate?: string
  }
}
