import type { JobType as BullMQJobType } from "bullmq"
import type { Redis, RedisOptions } from "ioredis"

type RedisStatus = Redis["status"]

export type RedisConnectionOptions =
  | ({ url: string } & Omit<RedisOptions, "host" | "port">)
  | RedisOptions

export interface QueueConfig {
  name: string
  displayName?: string
  prefix?: string
}

export interface MuletaOptions {
  redis: RedisConnectionOptions
  queues?: QueueConfig[]
}

export interface QueueCounts {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
  prioritized: number
  "waiting-children": number
}

export interface QueueInfo {
  name: string
  displayName: string
  prefix?: string
  counts: QueueCounts
  isPaused: boolean
}

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

export interface QueueRegistry {
  register(config: QueueConfig): void
  has(name: string): boolean
  list(): Promise<QueueInfo[]>
  get(name: string): Promise<QueueInfo>
  getJobs(name: string, opts: GetJobsOptions): Promise<GetJobsResult>
  /** Returns `null` if the job no longer exists (e.g. removed, expired). */
  getJob(name: string, id: string): Promise<JobDetail | null>
  /** Requeue a failed job. Throws `InvalidJobStateError` if not failed. */
  retryJob(name: string, id: string): Promise<void>
  removeJob(name: string, id: string): Promise<void>
  /** Promote a delayed job to the wait list. Throws `InvalidJobStateError` if not delayed. */
  promoteJob(name: string, id: string): Promise<void>
  /**
   * Enqueue a new job. Returns the `JobInfo` for the newly-added job so
   * callers (notably the HTTP layer) can navigate straight to its detail.
   */
  addJob(name: string, jobName: string, data: unknown, opts?: AddJobOptions): Promise<JobInfo>
  /**
   * Snapshot of every job name muleta has ever observed across every
   * registered queue. Backed by an in-memory cache; safe to call on every
   * request. Returns the empty array until the index is populated (first
   * `refreshJobNames` or first `addJob`).
   */
  getJobNames(): string[]
  /**
   * Pull recent jobs from Redis and feed any unseen names into the index.
   * Bounded scan — at most ~200 jobs per registered queue. Called by the
   * server on first index read and by the periodic discover loop.
   */
  refreshJobNames(): Promise<void>
}

/**
 * Thrown by `retryJob`/`promoteJob` when the current state doesn't allow the
 * transition (e.g. retrying a completed job, promoting an active one).
 * Distinct class so the HTTP layer can map it to 400 without inspecting
 * message strings.
 */
export class InvalidJobStateError extends Error {
  readonly current: JobState
  readonly expected: JobState[]
  constructor(action: string, current: JobState, expected: JobState[]) {
    super(`Cannot ${action} a job in state "${current}" — must be one of: ${expected.join(", ")}`)
    this.name = "InvalidJobStateError"
    this.current = current
    this.expected = expected
  }
}

/** Thrown by job-scoped methods when the job doesn't exist in Redis. */
export class JobNotFoundError extends Error {
  readonly queueName: string
  readonly jobId: string
  constructor(queueName: string, jobId: string) {
    super(`Job "${jobId}" not found in queue "${queueName}"`)
    this.name = "JobNotFoundError"
    this.queueName = queueName
    this.jobId = jobId
  }
}

export type RedisConnectionStatus = RedisStatus

export const REDIS_CONNECTION_STATUSES = [
  "connecting",
  "connect",
  "ready",
  "reconnecting",
  "close",
  "end",
  "wait",
] as const satisfies readonly RedisConnectionStatus[]

export interface RedisHealth {
  status: RedisConnectionStatus
  /** Whether `status === "ready"` — the client can accept commands right now. */
  connected: boolean
  /** Round-trip time of a PING in ms, or null if the socket isn't ready. */
  pingMs: number | null
  /** Host:port or masked URL, depending on how Redis was configured. */
  address: string
  /**
   * Subset of `INFO server | memory | clients`. Omitted when a PING failed
   * (no point attempting INFO on a dead socket).
   */
  info?: {
    version: string
    uptimeSeconds: number
    memoryUsedBytes: number
    memoryUsedHuman: string
    connectedClients: number
  }
}

export interface HealthStatus {
  /** Monotonically increasing on each emit; useful as an SSE `id:` field. */
  timestamp: number
  /** How long the muleta process has been alive, in seconds. */
  uptimeSeconds: number
  redis: RedisHealth
}

export interface Muleta {
  queues: QueueRegistry
  health(): Promise<HealthStatus>
  close(): Promise<void>
}
