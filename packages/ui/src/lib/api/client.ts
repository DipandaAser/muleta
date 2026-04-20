import type { Handler } from "@muleta/server"
import { hc, type InferResponseType } from "hono/client"

/**
 * Base URL for the muleta API. Same-origin in both dev (Vite proxy) and
 * production (standalone serves the SPA + API on the same port).
 */
const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3737"

export const api = hc<Handler>(baseUrl)

// Derived response types — single source of truth for what the API returns.
// Keeps components from hand-typing shapes that drift out of sync with the server.
export type ListQueuesResponse = InferResponseType<typeof api.api.v1.queues.$get>
export type Queue = ListQueuesResponse["queues"][number]
