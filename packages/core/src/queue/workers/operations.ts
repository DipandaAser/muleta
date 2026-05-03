import type { RegistryState } from "../state.js"
import type { QueueRegistry } from "../types.js"
import type { WorkerInfo } from "./types.js"

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

export function createWorkerOps(state: RegistryState): Pick<QueueRegistry, "getWorkers"> {
  return {
    async getWorkers() {
      const out: WorkerInfo[] = []
      for (const name of state.configs.keys()) {
        try {
          const { queue } = state.getOrCreate(name)
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
  }
}
