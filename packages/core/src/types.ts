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
}

export interface Muleta {
  queues: QueueRegistry
  close(): Promise<void>
}
