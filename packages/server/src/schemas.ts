import { z } from "@hono/zod-openapi"

const count = z.number().int().nonnegative()

export const QueueCountsSchema = z
  .object({
    waiting: count,
    active: count,
    completed: count,
    failed: count,
    delayed: count,
    paused: count,
    prioritized: count,
    "waiting-children": count,
  })
  .openapi("QueueCounts")

export const QueueInfoSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    prefix: z.string().optional(),
    counts: QueueCountsSchema,
    isPaused: z.boolean(),
  })
  .openapi("QueueInfo")

export const ListQueuesResponseSchema = z
  .object({
    queues: z.array(QueueInfoSchema),
  })
  .openapi("ListQueuesResponse")
