import { api, type Worker } from "$lib/api/client"
import type { CrumbFn } from "$lib/shell/crumbs"
import type { PageLoad } from "./$types"

/**
 * Fetches the global worker list and filters to the current queue. There's
 * no per-queue endpoint yet — at expected dashboard scale (dozens of workers)
 * a single fetch + filter is cheaper than maintaining a parallel route.
 */
export const load: PageLoad = async ({ params }) => {
  let workers: Worker[] = []
  let error: string | null = null
  try {
    const res = await api.api.v1.workers.$get()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    workers = body.workers.filter((w) => w.queue === params.name)
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load workers"
  }
  return { workers, error }
}

export const _crumb: CrumbFn = () => ({ label: "Workers" })
