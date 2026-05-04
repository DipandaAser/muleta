import { z } from "@hono/zod-openapi"
import { JobStateSchema } from "../jobs/schema.js"

export const FlowSummarySchema = z
  .object({
    id: z.string(),
    queue: z.string(),
    name: z.string(),
    state: JobStateSchema,
    addedAt: z.number().int(),
    childrenCount: z.number().int().nonnegative(),
  })
  .openapi("FlowSummary")

export const ListFlowsResponseSchema = z
  .object({
    flows: z.array(FlowSummarySchema),
  })
  .openapi("ListFlowsResponse")

/**
 * Recursive flow tree node. Zod's `z.lazy` is the standard escape
 * hatch for self-referential schemas; we let TS infer the type from
 * the schema rather than asserting it against a hand-written shape,
 * because `exactOptionalPropertyTypes` makes the optional-vs-undefined
 * distinction painful to keep in lockstep across two declarations.
 */
export const FlowJobNodeSchema = z
  .object({
    id: z.string(),
    queue: z.string(),
    name: z.string(),
    state: JobStateSchema,
    addedAt: z.number().int(),
    data: z.unknown(),
    failedReason: z.string().optional(),
    progress: z.union([z.number(), z.string(), z.boolean(), z.record(z.string(), z.unknown())]),
    attemptsMade: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    parentId: z.string().nullable(),
    get children() {
      return z.array(FlowJobNodeSchema)
    },
  })
  .openapi("FlowJobNode")
