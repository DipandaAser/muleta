import { api, type Queue } from "$lib/api/client"
import type { LayoutLoad } from "./$types"

export const load: LayoutLoad = async ({ params, fetch: _fetch }) => {
  // SPA mode — runs client-side; `fetch` is the standard browser fetch.
  let queue: Queue | null = null
  let error: string | null = null
  try {
    const res = await api.api.v1.queues[":name"].$get({ param: { name: params.name } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    queue = await res.json()
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load queue"
  }
  return { name: params.name, queue, error }
}
