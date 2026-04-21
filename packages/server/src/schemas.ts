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

export const JobStateSchema = z
  .enum([
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused",
    "prioritized",
    "waiting-children",
  ])
  .openapi("JobState")

export const JobInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    state: JobStateSchema,
    data: z.unknown(),
    progress: z.union([z.number(), z.string(), z.boolean(), z.record(z.string(), z.unknown())]),
    attemptsMade: count,
    attempts: count,
    failedReason: z.string().optional(),
    addedAt: z.number().int(),
    processedAt: z.number().int().optional(),
    finishedAt: z.number().int().optional(),
  })
  .openapi("JobInfo")

export const ListJobsResponseSchema = z
  .object({
    jobs: z.array(JobInfoSchema),
    total: count,
  })
  .openapi("ListJobsResponse")

export const JobDetailSchema = JobInfoSchema.extend({
  returnvalue: z.unknown(),
  stacktrace: z.array(z.string()),
  delay: z.number().int().nonnegative(),
  priority: z.number().int(),
  opts: z.record(z.string(), z.unknown()),
  logs: z.array(z.string()),
}).openapi("JobDetail")

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse")
