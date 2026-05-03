import type { Redis } from "ioredis"
import type { RedisConnectionStatus } from "../redis/types.js"
import type { HealthStatus, RedisHealth } from "./types.js"

/**
 * Parses the subset of `INFO` we care about. Redis returns a newline-delimited
 * string of `key:value` pairs grouped by `# Section` headers; we only pluck
 * a handful of fields and tolerate missing ones (older Redis versions may
 * not expose everything).
 */
function parseInfoFields(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const sep = line.indexOf(":")
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim()
    if (key) out[key] = value
  }
  return out
}

function formatAddress(redis: Redis): string {
  const opts = redis.options
  const host = opts.host ?? "localhost"
  const port = opts.port ?? 6379
  return `${host}:${port}`
}

/**
 * Measures PING rtt. ioredis queues commands during "connecting" and flushes
 * them once the socket is ready, so we issue the ping unconditionally and
 * guard with a short timeout — that way a mid-connect probe reflects the
 * real latency once the socket comes up, not whatever `status` says at this
 * exact microsecond. Returns null only for an actual socket failure.
 */
async function measurePing(redis: Redis, timeoutMs = 2000): Promise<number | null> {
  const start = Date.now()
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timed out")), timeoutMs)),
    ])
    return Date.now() - start
  } catch {
    return null
  }
}

export async function probeRedis(redis: Redis): Promise<RedisHealth> {
  const pingMs = await measurePing(redis)
  // Read status AFTER the ping — by then ioredis will have transitioned
  // out of "connecting" if the socket reached readiness during our probe.
  const status = redis.status as RedisConnectionStatus
  const address = formatAddress(redis)
  const base: RedisHealth = {
    status,
    connected: status === "ready",
    pingMs,
    address,
  }

  // Only hit INFO when the socket is actually usable — avoids a noisy error
  // path when Redis is down.
  if (pingMs === null) return base

  try {
    const raw = await redis.info("server", "memory", "clients")
    const fields = parseInfoFields(raw)
    const version = fields.redis_version
    const uptime = Number.parseInt(fields.uptime_in_seconds ?? "", 10)
    const memBytes = Number.parseInt(fields.used_memory ?? "", 10)
    const memHuman = fields.used_memory_human ?? ""
    const clients = Number.parseInt(fields.connected_clients ?? "", 10)
    if (
      version &&
      Number.isFinite(uptime) &&
      Number.isFinite(memBytes) &&
      Number.isFinite(clients)
    ) {
      return {
        ...base,
        info: {
          version,
          uptimeSeconds: uptime,
          memoryUsedBytes: memBytes,
          memoryUsedHuman: memHuman || `${memBytes}B`,
          connectedClients: clients,
        },
      }
    }
  } catch {
    // INFO can fail mid-reconnect; fall through to base.
  }
  return base
}

export function createHealthProbe(redis: Redis, startedAt: number) {
  return async function getHealth(): Promise<HealthStatus> {
    const redisHealth = await probeRedis(redis)
    return {
      timestamp: Date.now(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      redis: redisHealth,
    }
  }
}
