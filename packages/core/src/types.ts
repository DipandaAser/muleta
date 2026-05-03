import type { HealthStatus } from "./health/types.js"
import type { QueueConfig, QueueRegistry } from "./queue/types.js"
import type { RedisConnectionOptions } from "./redis/types.js"

export interface MuletaOptions {
  redis: RedisConnectionOptions
  queues?: QueueConfig[]
}

export interface Muleta {
  queues: QueueRegistry
  health(): Promise<HealthStatus>
  close(): Promise<void>
}
