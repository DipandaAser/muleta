import { api, type FlowSummary } from "$lib/api/client"
import type { CrumbFn } from "$lib/shell/crumbs"
import type { PageLoad } from "./$types"

export const load: PageLoad = async ({ params }) => {
  let flows: FlowSummary[] = []
  let error: string | null = null
  try {
    const res = await api.api.v1.queues[":name"].flows.$get({ param: { name: params.name } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    flows = body.flows
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load flows"
  }
  return { flows, error }
}

export const _crumb: CrumbFn = () => ({ label: "Flows" })
