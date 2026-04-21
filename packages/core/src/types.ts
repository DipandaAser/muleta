import type { RedisOptions } from "ioredis"

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

export type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused"
  | "prioritized"
  | "waiting-children"

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

export interface Muleta {
  queues: QueueRegistry
  close(): Promise<void>
}
