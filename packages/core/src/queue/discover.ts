import type { Redis } from "ioredis"
import type { RegistryState } from "./state.js"

/** BullMQ's default key prefix. */
export const DEFAULT_BULLMQ_PREFIX = "bull"

/**
 * SCAN Redis for `<prefix>:*:meta` keys and invoke `onFound` for each
 * discovered queue name. Uses cursor iteration so the event loop isn't
 * blocked on large keyspaces.
 */
async function scanPrefix(
  redis: Redis,
  prefix: string,
  onFound: (queueName: string) => void,
): Promise<void> {
  const pattern = `${prefix}:*:meta`
  const prefixLen = prefix.length + 1 // account for the trailing ':'
  const metaSuffixLen = ":meta".length
  let cursor = "0"
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200)
    for (const key of keys) {
      const name = key.slice(prefixLen, key.length - metaSuffixLen)
      if (name.length > 0) onFound(name)
    }
    cursor = next
  } while (cursor !== "0")
}

/**
 * Reconcile the registry against Redis: scan every passed prefix for
 * `<prefix>:<name>:meta`, register the unseen ones as `discovered`, and
 * evict any previously-discovered queue that has vanished. Explicit
 * registrations are never evicted. Returns the names of all registered
 * queues (explicit + discovered) after the pass.
 */
export function createDiscoverOps(state: RegistryState) {
  return {
    async discover(prefixes: string[]): Promise<string[]> {
      const seen = new Set<string>()
      const uniquePrefixes = Array.from(new Set(prefixes))

      for (const prefix of uniquePrefixes) {
        await scanPrefix(state.redis, prefix, (name) => {
          seen.add(name)
          if (!state.configs.has(name)) {
            state.registerInternal(
              { name, ...(prefix !== DEFAULT_BULLMQ_PREFIX ? { prefix } : {}) },
              "discovered",
            )
          }
        })
      }

      // Evict discovered queues that no longer exist in Redis.
      const toEvict: string[] = []
      for (const [name, source] of state.sources) {
        if (source === "discovered" && !seen.has(name)) toEvict.push(name)
      }
      for (const name of toEvict) {
        state.configs.delete(name)
        state.sources.delete(name)
        await state.closeQueue(name)
      }

      return [...state.configs.keys()]
    },
  }
}
