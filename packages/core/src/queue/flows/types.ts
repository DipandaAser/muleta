import type { JobProgress, JobState } from "../jobs/types.js"

/**
 * One row in the dashboard's flow list. Cheap to compute — just the
 * root job's own info plus a direct-children count via
 * `getDependenciesCount`. Per-descendant state breakdowns happen on
 * demand inside `getFlowTree` so the list view stays fast even when
 * many roots exist.
 */
export interface FlowSummary {
  /** Root job id. */
  id: string
  /** Queue the root lives in. */
  queue: string
  /** Job name (BullMQ `Job.name`). */
  name: string
  /** Current state of the root job. */
  state: JobState
  /** When the root was enqueued (Unix ms). */
  addedAt: number
  /**
   * Direct children of the root, counted via `getDependenciesCount`
   * (sum of processed + unprocessed). Does not recurse — grandchildren
   * are counted only when the consumer fetches the full tree.
   */
  childrenCount: number
}

/**
 * One node in a flow tree. Mirrors the BullMQ Job fields the dashboard
 * actually renders, plus a `parentId` pointer and an optional list of
 * children. Recursive — the same shape applies at every depth.
 *
 * Returned by `getFlowTree` already JSON-friendly, so consumers (HTTP
 * layer, the SvelteFlow graph) don't have to know about BullMQ's
 * `Job` class.
 */
export interface FlowJobNode {
  id: string
  queue: string
  name: string
  state: JobState
  addedAt: number
  /** Free-form payload the job was added with. */
  data: unknown
  /** Set when the job has failed at least once. */
  failedReason?: string
  /** BullMQ progress — number 0–100, percentage object, or custom value. */
  progress: JobProgress
  attemptsMade: number
  /** Max attempts configured via `opts.attempts` (default 1 in BullMQ). */
  attempts: number
  /** `null` if this node is the flow root. */
  parentId: string | null
  /** Children fetched at this level. Empty if leaf or beyond `depth`. */
  children: FlowJobNode[]
}

export interface GetFlowTreeOptions {
  /**
   * How many levels of descendants to fetch. Default 10 — deep enough
   * for most flow shapes, shallow enough that a pathological wide tree
   * doesn't blow the response.
   */
  depth?: number
  /**
   * Per-node cap on children fetched. Default 200 — trades full
   * fidelity on huge fan-outs for predictable latency.
   */
  maxChildren?: number
}
