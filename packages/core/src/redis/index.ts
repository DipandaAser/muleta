import { Redis, type RedisOptions } from "ioredis"
import type { RedisConnectionOptions } from "./types.js"

/**
 * Build an ioredis connection suitable for BullMQ.
 *
 * `maxRetriesPerRequest: null` is required for connections used by blocking
 * operations (Worker, QueueEvents). Queue-only connections don't strictly
 * need it but it's harmless and avoids surprises when the connection is
 * later shared.
 */
export function createRedis(opts: RedisConnectionOptions): Redis {
  if ("url" in opts && typeof opts.url === "string") {
    const { url, ...rest } = opts
    return new Redis(url, {
      maxRetriesPerRequest: null,
      ...rest,
    })
  }
  return new Redis({
    maxRetriesPerRequest: null,
    ...(opts as RedisOptions),
  })
}
