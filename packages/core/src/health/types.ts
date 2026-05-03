import type { RedisConnectionStatus } from "../redis/types.js"

export interface RedisHealth {
  status: RedisConnectionStatus
  /** Whether `status === "ready"` — the client can accept commands right now. */
  connected: boolean
  /** Round-trip time of a PING in ms, or null if the socket isn't ready. */
  pingMs: number | null
  /** Host:port or masked URL, depending on how Redis was configured. */
  address: string
  /**
   * Subset of `INFO server | memory | clients`. Omitted when a PING failed
   * (no point attempting INFO on a dead socket).
   */
  info?: {
    version: string
    uptimeSeconds: number
    memoryUsedBytes: number
    memoryUsedHuman: string
    connectedClients: number
  }
}

export interface HealthStatus {
  /** Monotonically increasing on each emit; useful as an SSE `id:` field. */
  timestamp: number
  /** How long the muleta process has been alive, in seconds. */
  uptimeSeconds: number
  redis: RedisHealth
}
