import { Clock } from "@lucide/svelte"
import { api, type JobScheduler } from "$lib/api/client"
import type { CrumbFn } from "$lib/shell/crumbs"
import type { PageLoad } from "./$types"

export const load: PageLoad = async () => {
  let schedulers: JobScheduler[] = []
  let error: string | null = null
  try {
    const res = await api.api.v1.schedulers.$get()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    schedulers = body.schedulers
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load schedulers"
  }
  return { schedulers, error }
}

export const _crumb: CrumbFn = () => ({
  label: "Schedulers",
  icon: Clock,
})
