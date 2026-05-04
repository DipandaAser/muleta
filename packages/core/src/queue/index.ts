import type { Redis } from "ioredis"
import { createDiscoverOps, DEFAULT_BULLMQ_PREFIX } from "./discover.js"
import { createFlowOps } from "./flows/operations.js"
import { createJobOps } from "./jobs/operations.js"
import { createLifecycleOps } from "./lifecycle.js"
import { createSchedulerOps } from "./schedulers/operations.js"
import { createRegistryState } from "./state.js"
import type { QueueRegistry } from "./types.js"
import { createWorkerOps } from "./workers/operations.js"

export { parseWorkerName } from "./workers/operations.js"
export { DEFAULT_BULLMQ_PREFIX }

/**
 * The public `QueueRegistry` plus the two methods the orchestrator
 * (`createMuleta`) uses but external callers shouldn't touch:
 *
 * - `discover(prefixes)` — reconciles the registry against Redis on a
 *   timer so newly-deployed queues show up without a restart.
 * - `close()` — disconnects every cached `Queue` and clears the maps.
 */
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

/**
 * Compose the per-feature operation modules into the full registry.
 * Each `create<Feature>Ops` factory is closure-pure: it takes the
 * shared `RegistryState` and returns the `QueueRegistry` slice it
 * implements. New feature folders plug in here without touching
 * existing modules — same shape as the server's `createQueuesApp`
 * mounting sub-apps.
 */
export function createQueueRegistry(redis: Redis): InternalQueueRegistry {
  const state = createRegistryState(redis)
  const lifecycle = createLifecycleOps(state)
  const discover = createDiscoverOps(state)
  const jobs = createJobOps(state)
  const schedulers = createSchedulerOps(state)
  const workers = createWorkerOps(state)
  const flows = createFlowOps(state)
  return {
    ...lifecycle,
    ...discover,
    ...jobs,
    ...schedulers,
    ...workers,
    ...flows,
  }
}
