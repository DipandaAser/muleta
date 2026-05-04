import type { FlowJobNode, FlowSummary, GetFlowTreeOptions } from "./flows/types.js"
import type {
  AddJobOptions,
  GetJobsOptions,
  GetJobsResult,
  JobDetail,
  JobInfo,
} from "./jobs/types.js"
import type { JobSchedulerInfo } from "./schedulers/types.js"
import type { WorkerInfo } from "./workers/types.js"

export interface QueueConfig {
  name: string
  displayName?: string
  prefix?: string
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

export interface QueueRegistry {
  register(config: QueueConfig): void
  has(name: string): boolean
  list(): Promise<QueueInfo[]>
  get(name: string): Promise<QueueInfo>
  /**
   * Pause the queue: workers stop picking up new jobs. Idempotent —
   * calling on an already-paused queue is a no-op. Throws if the queue
   * isn't registered.
   */
  pauseQueue(name: string): Promise<void>
  /**
   * Resume a paused queue. Idempotent — calling on a running queue is
   * a no-op. Throws if the queue isn't registered.
   */
  resumeQueue(name: string): Promise<void>
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
  /**
   * List workers connected to any registered queue. One entry per Redis
   * client connection observed via `CLIENT LIST`. Errors (e.g. GCP
   * Memorystore which doesn't support the command) yield an empty list
   * for the offending queue but don't abort the rest.
   */
  getWorkers(): Promise<WorkerInfo[]>
  /**
   * List job schedulers registered on the given queue, ordered by next
   * fire time (ascending — soonest first). Throws if the queue isn't
   * registered.
   */
  getJobSchedulers(name: string): Promise<JobSchedulerInfo[]>
  /**
   * Aggregate every scheduler across every registered queue, ordered
   * globally by next fire time (soonest first). Errors on a single
   * queue are logged and skipped — they don't abort the rest.
   */
  getAllJobSchedulers(): Promise<JobSchedulerInfo[]>
  /**
   * Remove a job scheduler from the given queue. Returns `true` when
   * BullMQ confirmed the removal (the scheduler existed) and `false`
   * when no scheduler with that id was found. Throws if the queue
   * isn't registered.
   */
  removeJobScheduler(name: string, schedulerId: string): Promise<boolean>
  /**
   * List flow roots living on the given queue, newest-first. A "flow
   * root" is a parent job (no `parentKey`) with at least one child via
   * `getDependenciesCount`. Bounded scan — only the most recent ~100
   * jobs per queue are inspected.
   */
  getFlows(name: string): Promise<FlowSummary[]>
  /**
   * Walk the flow tree rooted at `(queueName, rootId)` and return a
   * JSON-friendly recursive structure. Returns `null` if the root
   * doesn't exist. Throws if the queue isn't registered.
   */
  getFlowTree(
    queueName: string,
    rootId: string,
    opts?: GetFlowTreeOptions,
  ): Promise<FlowJobNode | null>
}
