import { createRoute, z } from "@hono/zod-openapi"
import type { AddJobOptions } from "@muleta-dev/core"
import { defineEndpoint } from "../../../define.js"
import { AddJobRequestSchema, ErrorResponseSchema, JobInfoSchema } from "../schema.js"

export const route = createRoute({
  method: "post",
  path: "/{name}/jobs",
  tags: ["Jobs"],
  request: {
    params: z.object({ name: z.string().min(1) }),
    body: {
      content: { "application/json": { schema: AddJobRequestSchema } },
      description: "Job to enqueue: BullMQ name, free-form data, optional opts.",
    },
  },
  responses: {
    201: {
      description: "Job enqueued — returns the freshly-created JobInfo.",
      content: { "application/json": { schema: JobInfoSchema } },
    },
    404: {
      description: "Queue isn't registered.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
})

export const addJob = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    const body = c.req.valid("json")
    const info = await muleta.queues.addJob(
      name,
      body.name,
      body.data,
      body.opts as AddJobOptions | undefined,
    )
    return c.json(info, 201)
  },
})
