import { api, type Queue } from "$lib/api/client"
import type { PageLoad } from "./$types"

export const load: PageLoad = async () => {
  // Initial HTTP snapshot so the page renders with data on first paint.
  // The SSE subscription mounted in +page.svelte takes over from here.
  let queues: Queue[] = []
  let error: string | null = null
  try {
    const res = await api.api.v1.queues.$get()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    queues = body.queues
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load queues"
  }
  return { queues, error }
}
