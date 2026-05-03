import { z } from "@hono/zod-openapi"

export const JobSchedulerInfoSchema = z
  .object({
    id: z.string(),
    queue: z.string(),
    jobName: z.string(),
    pattern: z.string().optional(),
    every: z.number().int().nonnegative().optional(),
    tz: z.string().optional(),
    limit: z.number().int().nonnegative().optional(),
    iterationCount: z.number().int().nonnegative().optional(),
    startDate: z.number().int().optional(),
    endDate: z.number().int().optional(),
    next: z.number().int().nullable(),
    template: z
      .object({
        data: z.unknown().optional(),
        opts: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .openapi("JobSchedulerInfo")

export const ListJobSchedulersResponseSchema = z
  .object({
    schedulers: z.array(JobSchedulerInfoSchema),
  })
  .openapi("ListJobSchedulersResponse")
