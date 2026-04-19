import type { RedisOptions } from "ioredis"

export type RedisConnectionOptions =
  | ({ url: string } & Omit<RedisOptions, "host" | "port">)
  | RedisOptions

export interface QueueConfig {
  name: string
  displayName?: string
  prefix?: string
}

export interface MuletaOptions {
  redis: RedisConnectionOptions
  queues?: QueueConfig[]
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
}

export interface Muleta {
  queues: QueueRegistry
  close(): Promise<void>
}
