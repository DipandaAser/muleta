import type { Job, JobNode } from "bullmq"
import type { JobState } from "../jobs/types.js"
import type { RegistryState } from "../state.js"
import type { FlowJobNode, FlowSummary, GetFlowTreeOptions } from "./types.js"

/**
 * States we scan when discovering flow roots. We deliberately skip
 * `paused` (per-queue flag, no dedicated list) and `waiting-children`
 * isn't strictly necessary since a flow root in waiting-children will
 * also have an entry in `delayed`/`waiting`/`active` once unblocked,
 * but including it surfaces still-blocked roots in the listing.
 */
const FLOW_ROOT_SCAN_STATES: JobState[] = [
  "completed",
  "failed",
  "active",
  "delayed",
  "waiting",
  "prioritized",
  "waiting-children",
]

/** How many recent jobs to scan per queue when listing flows. */
const FLOW_ROOT_SCAN_LIMIT = 100

/**
 * Cap on simultaneous Redis round-trips during the getState +
 * getDependenciesCount fan-out. Bounds the connection pressure on
 * managed Redis tiers without serializing the requests outright.
 */
const FLOW_SUMMARY_CONCURRENCY = 8

/**
 * Run `worker(item)` over `items` with at most `limit` promises
 * in flight at a time. Order-preserving — we still index back into
 * the original positions so callers can `filter` on the result.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await worker(items[i]!)
    }
  })
  await Promise.all(runners)
  return out
}

export interface FlowOps {
  /**
   * List flow roots living on the given queue, newest-first. Throws if
   * the queue isn't registered. Bounded scan — only the most recent
   * `FLOW_ROOT_SCAN_LIMIT` jobs are inspected, so very old flows fall
   * out of the listing once the queue grows beyond that window.
   */
  getFlows(name: string): Promise<FlowSummary[]>
  /**
   * Aggregate flow roots across every registered queue, sorted
   * newest-first by `addedAt`. Errors on a single queue are logged and
   * skipped — they don't abort the rest. Mirrors `getAllJobSchedulers`
   * for the global Flows sidebar screen.
   */
  getAllFlows(): Promise<FlowSummary[]>
  /**
   * Walk the flow tree rooted at `(queueName, rootId)` and serialize
   * it into a JSON-friendly recursive structure. Throws if the queue
   * isn't registered. Returns `null` if the root doesn't exist.
   */
  getFlowTree(
    queueName: string,
    rootId: string,
    opts?: GetFlowTreeOptions,
  ): Promise<FlowJobNode | null>
}

export function createFlowOps(state: RegistryState): FlowOps {
  return {
    async getFlows(name) {
      const { queue } = state.getOrCreate(name)
      const jobs = await queue.getJobs(FLOW_ROOT_SCAN_STATES, 0, FLOW_ROOT_SCAN_LIMIT - 1, false)
      const roots = jobs.filter((j): j is Job => Boolean(j) && !j.parentKey)

      // Bounded fan-out: each root costs 2 Redis round-trips
      // (`getState` + `getDependenciesCount`). With 100 candidate
      // roots that would be 200 simultaneous commands without the
      // limiter — fine on local Redis but a noticeable spike against
      // managed tiers.
      const summaries = await mapWithConcurrency(roots, FLOW_SUMMARY_CONCURRENCY, async (job) => {
        const [stateRaw, deps] = await Promise.all([
          job.getState() as Promise<JobState>,
          job.getDependenciesCount(),
        ])
        const childrenCount = (deps.processed ?? 0) + (deps.unprocessed ?? 0)
        if (childrenCount === 0) return null
        return {
          id: String(job.id),
          queue: name,
          name: job.name,
          state: stateRaw,
          addedAt: job.timestamp,
          childrenCount,
        } satisfies FlowSummary
      })
      return summaries.filter((s): s is FlowSummary => s !== null)
    },

    async getAllFlows() {
      const out: FlowSummary[] = []
      for (const name of state.configs.keys()) {
        try {
          const { queue } = state.getOrCreate(name)
          const jobs = await queue.getJobs(
            FLOW_ROOT_SCAN_STATES,
            0,
            FLOW_ROOT_SCAN_LIMIT - 1,
            false,
          )
          const roots = jobs.filter((j): j is Job => Boolean(j) && !j.parentKey)
          const summaries = await mapWithConcurrency(
            roots,
            FLOW_SUMMARY_CONCURRENCY,
            async (job) => {
              const [stateRaw, deps] = await Promise.all([
                job.getState() as Promise<JobState>,
                job.getDependenciesCount(),
              ])
              const childrenCount = (deps.processed ?? 0) + (deps.unprocessed ?? 0)
              if (childrenCount === 0) return null
              return {
                id: String(job.id),
                queue: name,
                name: job.name,
                state: stateRaw,
                addedAt: job.timestamp,
                childrenCount,
              } satisfies FlowSummary
            },
          )
          for (const s of summaries) if (s) out.push(s)
        } catch (err) {
          // One bad queue shouldn't poison the cross-queue view.
          console.error(`[muleta] getAllFlows failed for "${name}":`, err)
        }
      }
      // Newest-first across queues so recently-fired flows float to the
      // top of the global rail regardless of which queue they live on.
      out.sort((a, b) => b.addedAt - a.addedAt)
      return out
    },

    async getFlowTree(queueName, rootId, opts) {
      const { cfg } = state.getOrCreate(queueName)
      const flow = state.getFlowProducer()
      const node = await flow.getFlow({
        id: rootId,
        queueName: cfg.name,
        ...(opts?.depth !== undefined ? { depth: opts.depth } : { depth: 10 }),
        ...(opts?.maxChildren !== undefined
          ? { maxChildren: opts.maxChildren }
          : { maxChildren: 200 }),
        ...(cfg.prefix !== undefined ? { prefix: cfg.prefix } : {}),
      })
      if (!node?.job) return null
      return serializeFlow(node, queueName, null)
    },
  }
}

/**
 * Recursively project a BullMQ `JobNode` (the result of
 * `FlowProducer.getFlow`) into the dashboard-friendly `FlowJobNode`
 * shape. Each node's state is fetched once via `Job.getState()`;
 * children are walked depth-first with the same `parentId` threading
 * so the consumer can render edges without a second pass.
 */
async function serializeFlow(
  node: JobNode,
  queueName: string,
  parentId: string | null,
): Promise<FlowJobNode> {
  const { job, children } = node
  const stateRaw = (await job.getState()) as JobState
  const id = String(job.id)
  const serializedChildren: FlowJobNode[] = children
    ? await Promise.all(children.map((c) => serializeFlow(c, jobQueueName(c, queueName), id)))
    : []
  return {
    id,
    queue: queueName,
    name: job.name,
    state: stateRaw,
    addedAt: job.timestamp,
    data: job.data,
    progress: job.progress ?? 0,
    attemptsMade: job.attemptsMade,
    attempts: job.opts.attempts || 1,
    parentId,
    children: serializedChildren,
    ...(job.failedReason !== undefined ? { failedReason: job.failedReason } : {}),
  }
}

/**
 * Children of a flow can live on a different queue from their parent
 * — that's the whole point of cross-queue flows. BullMQ's `JobNode`
 * doesn't surface the queue name directly, but `Job.queueName`
 * holds it once the job is loaded. Fall back to the parent's queue
 * if the property somehow isn't there.
 */
function jobQueueName(node: JobNode, fallback: string): string {
  // BullMQ's Job exposes `.queueName`; treat as `unknown` to stay
  // robust against minor signature drift across versions.
  const qn = (node.job as { queueName?: unknown }).queueName
  return typeof qn === "string" && qn ? qn : fallback
}
