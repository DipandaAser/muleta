import { OpenAPIHono } from "@hono/zod-openapi"
import type { Muleta } from "@muleta-dev/core"
import { getQueue } from "./handlers/getQueue.js"
import { listQueues } from "./handlers/listQueues.js"
import { pauseQueue } from "./handlers/pauseQueue.js"
import { queuesEvents } from "./handlers/queuesEvents.js"
import { resumeQueue } from "./handlers/resumeQueue.js"
import { addJob } from "./jobs/handlers/addJob.js"
import { getJob } from "./jobs/handlers/getJob.js"
import { listJob } from "./jobs/handlers/listJob.js"
import { promoteJob } from "./jobs/handlers/promoteJob.js"
import { removeJob } from "./jobs/handlers/removeJob.js"
import { retryJob } from "./jobs/handlers/retryJob.js"
import { listSchedulers } from "./schedulers/handlers/listSchedulers.js"
import { removeScheduler } from "./schedulers/handlers/removeScheduler.js"

/**
 * Registration order matters for routes with literal vs parameterized
 * segments: `/events` is declared before `/{name}` so the router can't
 * mistake the literal for a queue name.
 */
export function createQueuesApp(muleta: Muleta) {
  return new OpenAPIHono()
    .openapi(listQueues.route, listQueues.handler(muleta))
    .openapi(queuesEvents.route, queuesEvents.handler(muleta))
    .openapi(getQueue.route, getQueue.handler(muleta))
    .openapi(listJob.route, listJob.handler(muleta))
    .openapi(addJob.route, addJob.handler(muleta))
    .openapi(getJob.route, getJob.handler(muleta))
    .openapi(removeJob.route, removeJob.handler(muleta))
    .openapi(retryJob.route, retryJob.handler(muleta))
    .openapi(promoteJob.route, promoteJob.handler(muleta))
    .openapi(listSchedulers.route, listSchedulers.handler(muleta))
    .openapi(removeScheduler.route, removeScheduler.handler(muleta))
    .openapi(pauseQueue.route, pauseQueue.handler(muleta))
    .openapi(resumeQueue.route, resumeQueue.handler(muleta))
}
