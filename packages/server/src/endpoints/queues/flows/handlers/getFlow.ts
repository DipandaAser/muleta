import { createRoute, z } from "@hono/zod-openapi"
import { defineEndpoint } from "../../../define.js"
import { FlowJobNodeSchema } from "../schema.js"

export const route = createRoute({
  method: "get",
  path: "/{name}/flows/{id}",
  tags: ["Queues"],
  request: {
    params: z.object({
      name: z.string().min(1),
      id: z.string().min(1),
    }),
    query: z.object({
      depth: z.coerce.number().int().min(1).max(20).optional(),
      maxChildren: z.coerce.number().int().min(1).max(500).optional(),
    }),
  },
  responses: {
    200: {
      description: "The flow tree rooted at this job, serialized as a recursive node.",
      content: { "application/json": { schema: FlowJobNodeSchema } },
    },
    404: { description: "Queue isn't registered, or the flow root doesn't exist." },
  },
})

export const getFlow = defineEndpoint({
  route,
  handler: (muleta) => async (c) => {
    const { name, id } = c.req.valid("param")
    if (!muleta.queues.has(name)) {
      return c.json({ error: "queue not registered" }, 404)
    }
    const { depth, maxChildren } = c.req.valid("query")
    const opts: { depth?: number; maxChildren?: number } = {}
    if (depth !== undefined) opts.depth = depth
    if (maxChildren !== undefined) opts.maxChildren = maxChildren
    const tree = await muleta.queues.getFlowTree(name, id, opts)
    if (!tree) {
      return c.json({ error: "flow root not found" }, 404)
    }
    return c.json(tree, 200)
  },
})
