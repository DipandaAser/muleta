import type { Redis, RedisOptions } from "ioredis"

type RedisStatus = Redis["status"]

export type RedisConnectionOptions =
  | ({ url: string } & Omit<RedisOptions, "host" | "port">)
  | RedisOptions

export type RedisConnectionStatus = RedisStatus

export const REDIS_CONNECTION_STATUSES = [
  "connecting",
  "connect",
  "ready",
  "reconnecting",
  "close",
  "end",
  "wait",
] as const satisfies readonly RedisConnectionStatus[]
