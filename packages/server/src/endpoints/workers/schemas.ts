import { z } from "@hono/zod-openapi"

export const WorkerInfoSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    queue: z.string(),
    addr: z.string(),
    ageSeconds: z.number().int().nonnegative(),
    idleSeconds: z.number().int().nonnegative(),
  })
  .openapi("WorkerInfo")

export const ListWorkersResponseSchema = z
  .object({
    workers: z.array(WorkerInfoSchema),
  })
  .openapi("ListWorkersResponse")
