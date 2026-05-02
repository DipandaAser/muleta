import { api, type Worker } from "$lib/api/client"
import type { PageLoad } from "./$types"

export const load: PageLoad = async () => {
  let workers: Worker[] = []
  let error: string | null = null
  try {
    const res = await api.api.v1.workers.$get()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    workers = body.workers
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load workers"
  }
  return { workers, error }
}
