import type { Handler } from "@muleta-dev/server"
import { hc, type InferRequestType, type InferResponseType } from "hono/client"

declare global {
  interface Window {
    /**
     * Mount path the dashboard was served from, injected into
     * `index.html` by `@muleta-dev/server`'s handler at request time.
     * Empty string when served at root. Lets the same SPA bundle work
     * under `/admin/queues`, a subdomain, or anywhere else without a
     * per-mount rebuild.
     */
    __MULETA_BASE__?: string
  }
}

/**
 * Base URL for the muleta API. Reads `window.__MULETA_BASE__` first
 * (set by the embedded handler), falls back to `window.location.origin`
 * for dev (Vite proxy) and the SSR/test default.
 */
const baseUrl =
  typeof window !== "undefined"
    ? window.location.origin + (window.__MULETA_BASE__ ?? "")
    : "http://localhost:3737"

export const api = hc<Handler>(baseUrl)

// Derived response types — single source of truth for what the API returns.
// Keeps components from hand-typing shapes that drift out of sync with the server.
export type ListQueuesResponse = InferResponseType<typeof api.api.v1.queues.$get, 200>
export type Queue = ListQueuesResponse["queues"][number]

export type ListJobsResponse = InferResponseType<
  (typeof api.api.v1.queues)[":name"]["jobs"]["$get"],
  200
>
export type Job = ListJobsResponse["jobs"][number]

export type JobDetail = InferResponseType<
  (typeof api.api.v1.queues)[":name"]["jobs"][":id"]["$get"],
  200
>

export type HealthStatus = InferResponseType<typeof api.api.v1.health.$get, 200>

export type JobNamesResponse = InferResponseType<typeof api.api.v1.jobs.names.$get, 200>

export type ListWorkersResponse = InferResponseType<typeof api.api.v1.workers.$get, 200>
export type Worker = ListWorkersResponse["workers"][number]

export type ListJobSchedulersResponse = InferResponseType<
  (typeof api.api.v1.queues)[":name"]["schedulers"]["$get"],
  200
>
export type JobScheduler = ListJobSchedulersResponse["schedulers"][number]

export type ListAllSchedulersResponse = InferResponseType<typeof api.api.v1.schedulers.$get, 200>

export type ListFlowsResponse = InferResponseType<
  (typeof api.api.v1.queues)[":name"]["flows"]["$get"],
  200
>
export type FlowSummary = ListFlowsResponse["flows"][number]

export type ListAllFlowsResponse = InferResponseType<typeof api.api.v1.flows.$get, 200>

export type FlowJobNode = InferResponseType<
  (typeof api.api.v1.queues)[":name"]["flows"][":id"]["$get"],
  200
>

/**
 * Body shape for `POST /api/v1/queues/:name/jobs`. Inferred from the route so
 * the form's outgoing payload can never drift from the server schema.
 */
export type AddJobRequest = InferRequestType<
  (typeof api.api.v1.queues)[":name"]["jobs"]["$post"]
>["json"]
export type AddJobOptions = NonNullable<AddJobRequest["opts"]>

export type JobState = Job["state"]

export const JOB_STATES: readonly JobState[] = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "prioritized",
] as const
