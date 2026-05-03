import { api, type JobScheduler } from "$lib/api/client"
import type { PageLoad } from "./$types"

export const load: PageLoad = async ({ params }) => {
  let schedulers: JobScheduler[] = []
  let error: string | null = null
  try {
    const res = await api.api.v1.queues[":name"].schedulers.$get({ param: { name: params.name } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    schedulers = body.schedulers
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load schedulers"
  }
  return { schedulers, error }
}
