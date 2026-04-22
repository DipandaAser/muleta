import { z } from "@hono/zod-openapi"
import { REDIS_CONNECTION_STATUSES } from "@muleta/core"

const RedisStatusSchema = z.enum(REDIS_CONNECTION_STATUSES).openapi("RedisConnectionStatus")

export const RedisHealthSchema = z
  .object({
    status: RedisStatusSchema,
    connected: z.boolean(),
    pingMs: z.number().nullable(),
    address: z.string(),
    info: z
      .object({
        version: z.string(),
        uptimeSeconds: z.number().int().nonnegative(),
        memoryUsedBytes: z.number().int().nonnegative(),
        memoryUsedHuman: z.string(),
        connectedClients: z.number().int().nonnegative(),
      })
      .optional(),
  })
  .openapi("RedisHealth")

export const HealthStatusSchema = z
  .object({
    timestamp: z.number().int(),
    uptimeSeconds: z.number().int().nonnegative(),
    redis: RedisHealthSchema,
  })
  .openapi("HealthStatus")
