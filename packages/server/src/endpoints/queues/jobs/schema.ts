import { z } from "@hono/zod-openapi"

const count = z.number().int().nonnegative()

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

/** Route params shared by every `/{name}/jobs/{id}...` endpoint. */
export const jobParamsSchema = z.object({
  name: z.string().min(1),
  id: z.string().min(1),
})

/**
 * Subset of BullMQ `JobsOptions` accepted by the dashboard's add-job form.
 * Caps (255-char names, 50 attempts) are sanity bounds, not auth — anyone
 * who can reach the API can already do worse via Redis directly. They just
 * stop fat-finger mistakes from creating pathological jobs.
 */
export const AddJobOptionsSchema = z
  .object({
    jobId: z.string().min(1).max(255).optional(),
    priority: z.number().int().min(0).optional(),
    attempts: z.number().int().min(1).max(50).optional(),
    delay: z.number().int().min(0).optional(),
    backoff: z
      .object({
        type: z.enum(["fixed", "exponential"]),
        delay: z.number().int().min(0),
      })
      .optional(),
    // KeepJobs — boolean (immediate / never), number (keep last N), or
    // an object with `count` and/or `age` (in seconds). Mirrors the
    // shape BullMQ accepts at https://docs.bullmq.io/guide/queues/auto-removal-of-jobs.
    removeOnComplete: z
      .union([
        z.boolean(),
        z.number().int().min(0),
        z.object({
          count: z.number().int().min(0).optional(),
          age: z.number().int().min(0).optional(),
        }),
      ])
      .optional(),
    removeOnFail: z
      .union([
        z.boolean(),
        z.number().int().min(0),
        z.object({
          count: z.number().int().min(0).optional(),
          age: z.number().int().min(0).optional(),
        }),
      ])
      .optional(),
    repeat: z
      .object({
        pattern: z.string().min(1),
        tz: z.string().optional(),
        limit: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .openapi("AddJobOptions")

export const AddJobRequestSchema = z
  .object({
    name: z.string().min(1).max(255),
    data: z.unknown().optional(),
    opts: AddJobOptionsSchema.optional(),
  })
  .openapi("AddJobRequest")

export const JobNamesResponseSchema = z
  .object({
    names: z.array(z.string()),
  })
  .openapi("JobNamesResponse")
